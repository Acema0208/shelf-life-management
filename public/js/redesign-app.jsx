if (!window.React || !window.ReactDOM) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<div style="padding:24px;font-family:sans-serif;color:#444;">页面初始化失败：React 未加载，请刷新重试。</div>';
  }
  throw new Error('React runtime is missing');
}

const { useEffect, useMemo, useRef, useState } = React;

const IconFallback = ({ className = '' }) => (
  <span
    className={className}
    style={{ display: 'inline-block', width: '1em', height: '1em', borderRadius: '50%', background: 'currentColor', opacity: 0.35 }}
  />
);

const Icons = window.LucideReact || {};
const Plus = Icons.Plus || IconFallback;
const Upload = Icons.Upload || IconFallback;
const Download = Icons.Download || IconFallback;
const Search = Icons.Search || IconFallback;
const Edit2 = Icons.Edit2 || IconFallback;
const Trash2 = Icons.Trash2 || IconFallback;
const Activity = Icons.Activity || IconFallback;
const Box = Icons.Box || IconFallback;
const ChevronLeft = Icons.ChevronLeft || IconFallback;
const ChevronRight = Icons.ChevronRight || IconFallback;
const Cloud = Icons.Cloud || IconFallback;
const FileText = Icons.FileText || IconFallback;
const FileSpreadsheet = Icons.FileSpreadsheet || IconFallback;
const ClipboardList = Icons.ClipboardList || IconFallback;
const Smartphone = Icons.Smartphone || IconFallback;
const BarChart2 = Icons.BarChart2 || IconFallback;
const BarChart3 = Icons.BarChart3 || BarChart2 || IconFallback;
const Database = Icons.Database || IconFallback;
const RotateCcw = Icons.RotateCcw || IconFallback;
const MoreHorizontal = Icons.MoreHorizontal || IconFallback;
const X = Icons.X || IconFallback;

const DEFAULT_ITEMS_PER_PAGE = 10;
const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'ok', label: '正常' },
  { value: 'expired', label: '已过期' },
  { value: 'soon_7', label: '7天内到期' },
  { value: 'soon_15', label: '15天内到期' },
  { value: 'soon_1', label: '本月到期' },
  { value: 'soon_2', label: '2个月内到期' },
  { value: 'soon_3', label: '3个月内到期' },
];
const INVENTORY_OPTIONS = [
  { value: '', label: '全部出入库' },
  { value: 'pending', label: '待入库' },
  { value: 'in', label: '已入库' },
  { value: 'out', label: '已出库' },
];
const UNIT_OPTIONS = [
  { value: '', label: '请选择数量单位' },
  { value: '件', label: '件' },
  { value: '个', label: '个' },
  { value: '盒', label: '盒' },
  { value: '瓶', label: '瓶' },
  { value: '袋', label: '袋' },
  { value: '支', label: '支' },
  { value: '片', label: '片' },
  { value: '套', label: '套' },
  { value: '罐', label: '罐' },
  { value: '包', label: '包' },
];
const MEASUREMENT_UNITS = new Set(['ml', 'L', 'g', 'kg']);
const OPERATOR_STORAGE_KEY = 'product-expiry-operator-name';

function statusToUi(status) {
  if (status === 'expired') return '过期';
  if (status === 'ok') return '正常';
  return '临近';
}

function statusText(status) {
  const map = {
    ok: '正常',
    expired: '已过期',
    soon_1: '本月到期',
    soon_2: '2个月内到期',
    soon_3: '3个月内到期',
    soon_15: '15天内到期',
    soon_7: '7天内到期',
    soon_1m: '1个月内到期',
    soon_2m: '2个月内到期',
    soon_3m: '3个月内到期',
  };
  return map[status] || status || '-';
}

function invText(v) {
  const map = { pending: '待入库', in: '已入库', out: '已出库' };
  return map[v] || '-';
}

function formatDateDot(dateStr) {
  return String(dateStr || '').replace(/-/g, '.');
}

function formatQuantityWithUnit(quantity, unit) {
  const qty = quantity === null || quantity === undefined || quantity === '' ? '-' : String(quantity);
  const normalizedUnit = String(unit || '').trim();
  if (!normalizedUnit) return qty;
  if (MEASUREMENT_UNITS.has(normalizedUnit)) return qty;
  return `${qty}${normalizedUnit}`;
}

function formatSpecification(specification, quantity, unit) {
  const normalizedSpecification = String(specification || '').trim();
  const normalizedUnit = String(unit || '').trim();
  if (normalizedSpecification) {
    if (/^\d+(\.\d+)?$/.test(normalizedSpecification) && !MEASUREMENT_UNITS.has(normalizedUnit)) {
      return '-';
    }
    return normalizedSpecification;
  }
  if (!MEASUREMENT_UNITS.has(normalizedUnit)) return '-';
  const qty = quantity === null || quantity === undefined || quantity === '' ? '' : String(quantity);
  return qty ? `${qty}${normalizedUnit}` : normalizedUnit;
}

function getVisiblePages(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  if (currentPage <= 3) return [1, 2, 3, 4, '...', totalPages];
  if (currentPage >= totalPages - 2) return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
}

function defaultForm(operator) {
  return {
    name: '',
    expiry_date: '',
    quantity: 1,
    specification: '',
    unit: '',
    supplier: '',
    inventory_status: 'pending',
    note: '',
    created_by: operator || '',
  };
}

function StatusBadge({ status }) {
  const ui = statusToUi(status);
  if (ui === '正常') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800/40 border border-zinc-700/50 text-zinc-400 text-[10px] font-medium transition-colors">
        <span className="w-1 h-1 rounded-full bg-zinc-500"></span>
        正常
      </span>
    );
  }
  if (ui === '临近') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#E88B6A]/10 border border-[#E88B6A]/20 text-[#E88B6A] text-[10px] font-medium transition-colors">
        <span className="w-1 h-1 rounded-full bg-[#E88B6A] animate-pulse shadow-[0_0_8px_rgba(232,139,106,0.6)]"></span>
        临近
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-medium transition-colors">
      <span className="w-1 h-1 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
      过期
    </span>
  );
}

function Modal({ open, title, onClose, children, widthClass = 'max-w-2xl', mobileNoScroll = false }) {
  if (!open) return null;
  const modalHeightClass = mobileNoScroll ? 'max-h-[82dvh] sm:max-h-[90vh]' : 'max-h-[72dvh] sm:max-h-[90vh]';
  const bodyOverflowClass = mobileNoScroll ? 'overflow-y-auto overscroll-contain' : 'overflow-y-auto';
  return (
    <div className="fixed inset-0 z-[90] flex items-start sm:items-center justify-center px-2.5 sm:px-4 pt-[20vh] pb-3 sm:py-0">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`relative z-[91] w-[94vw] sm:w-full ${widthClass} ${modalHeightClass} rounded-2xl bg-zinc-900/95 border border-zinc-800 shadow-2xl flex flex-col`}>
        <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-4 border-b border-zinc-800 shrink-0">
          <h3 className="text-[15px] sm:text-base font-semibold text-zinc-100">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-zinc-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className={`p-2.5 sm:p-5 ${bodyOverflowClass}`}>{children}</div>
      </div>
    </div>
  );
}

async function apiFetch(url, options = {}) {
  const API_KEY_STORAGE = 'product-expiry-api-key';
  const opts = { ...options, headers: { ...(options.headers || {}) } };
  let key = '';
  try {
    key = (sessionStorage.getItem(API_KEY_STORAGE) || '').trim();
  } catch (_) {}
  if (key && !opts.headers['x-api-key']) opts.headers['x-api-key'] = key;

  let res = await fetch(url, opts);
  if (res.status !== 403) return res;

  let needKey = false;
  try {
    const j = await res.clone().json();
    needKey = String(j.error || '').includes('访问密钥无效');
  } catch (_) {}
  if (!needKey) return res;

  const input = window.prompt('该操作需要访问密钥，请输入 x-api-key：');
  if (!input || !input.trim()) return res;
  key = input.trim();
  try {
    sessionStorage.setItem(API_KEY_STORAGE, key);
  } catch (_) {}
  opts.headers['x-api-key'] = key;
  return fetch(url, opts);
}

function App() {
  const [introState, setIntroState] = useState('playing');
  const [selectedRows, setSelectedRows] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [hoveredRow, setHoveredRow] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
  const [statusFilter, setStatusFilter] = useState('');
  const [inventoryFilter, setInventoryFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [creatorFilter, setCreatorFilter] = useState('');
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [operatorName, setOperatorName] = useState(() => {
    try {
      return localStorage.getItem(OPERATOR_STORAGE_KEY) || '';
    } catch (_) {
      return '';
    }
  });

  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [creators, setCreators] = useState([]);
  const [stats, setStats] = useState(null);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(defaultForm(''));
  const [formLoading, setFormLoading] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState('');
  const [importing, setImporting] = useState(false);

  const [showBackup, setShowBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const restoreFileRef = useRef(null);

  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [showMobile, setShowMobile] = useState(false);
  const [mobileUrl, setMobileUrl] = useState('');
  const [mobileLoading, setMobileLoading] = useState(false);

  const [showCharts, setShowCharts] = useState(false);
  const [activeChart, setActiveChart] = useState('status');
  const [trendData, setTrendData] = useState([]);
  const toolsMenuRef = useRef(null);
  const toolsButtonRef = useRef(null);
  const [mobileToolsMenuTop, setMobileToolsMenuTop] = useState(120);
  const [mobileToolsMenuWidth, setMobileToolsMenuWidth] = useState(220);
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const fallbackLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const [runtimeRole, setRuntimeRole] = useState(fallbackLocalHost ? 'local' : 'cloud');
  const [runtimeMode, setRuntimeMode] = useState(fallbackLocalHost ? 'proxy' : 'direct');
  const syncActionBlocked = runtimeMode === 'proxy' || runtimeRole === 'cloud';
  const syncActionLabel = runtimeMode === 'proxy'
    ? '同步到云端（需完整本地服务）'
    : (runtimeRole === 'cloud' ? '同步到本地（请在本地端执行）' : '同步到云端');

  const allCurrentSelected = rows.length > 0 && rows.every((r) => selectedRows.includes(r.id));

  const summaryData = useMemo(() => {
    const s = stats || { total: 0, expired: 0, soon_1_total: 0, soon_3_total: 0, soon_7: 0, soon_15: 0, soon_1m: 0, soon_2m: 0, soon_3m: 0 };
    const monthCount = Number(s.soon_1_total || (Number(s.soon_7 || 0) + Number(s.soon_15 || 0) + Number(s.soon_1m || 0)));
    const threeMonthCount = Number(s.soon_3_total || (monthCount + Number(s.soon_2m || 0) + Number(s.soon_3m || 0)));
    return [
      { title: '总计录入', count: String(s.total || 0), desc: 'All Products', color: 'text-zinc-100', dotColor: 'bg-zinc-400', filterValue: '' },
      { title: '已过期', count: String(s.expired || 0), desc: 'Expired', color: 'text-rose-500', dotColor: 'bg-rose-500', filterValue: 'expired' },
      { title: '本月到期', count: String(monthCount), desc: 'Expiring Soon', color: 'text-amber-500', dotColor: 'bg-amber-500', filterValue: 'soon_1' },
      { title: '3个月内到期', count: String(threeMonthCount), desc: 'Upcoming Quarter', color: 'text-[#E88B6A]', dotColor: 'bg-[#E88B6A] animate-pulse', filterValue: 'soon_3' },
    ];
  }, [stats]);

  const chartRows = useMemo(() => {
    if (!stats) return [];
    if (activeChart === 'status') {
      return [
        { label: '已过期', value: stats.expired || 0 },
        { label: '7天内', value: stats.soon_7 || 0 },
        { label: '15天内', value: stats.soon_15 || 0 },
        { label: '1个月内', value: stats.soon_1m || 0 },
        { label: '2个月内', value: stats.soon_2m || 0 },
        { label: '3个月内', value: stats.soon_3m || 0 },
        { label: '正常', value: stats.ok || 0 },
      ];
    }
    if (activeChart === 'supplier') {
      const obj = stats.by_supplier || {};
      return Object.keys(obj)
        .map((k) => ({ label: k, value: obj[k] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
    }
    if (activeChart === 'inventory') {
      const obj = stats.by_inventory || {};
      return [
        { label: '待入库', value: obj.pending || 0 },
        { label: '已入库', value: obj.in || 0 },
        { label: '已出库', value: obj.out || 0 },
      ];
    }
    return trendData;
  }, [activeChart, stats, trendData]);

  const showToast = (msg) => {
    setToast(msg);
    window.clearTimeout(window.__toastTimer);
    window.__toastTimer = window.setTimeout(() => setToast(''), 2600);
  };

  const handleEnterSystem = () => {
    setIntroState('exiting');
    window.setTimeout(() => setIntroState('done'), 800);
  };

  const loadData = async (page = currentPage, options = {}) => {
    const { refreshStats = false } = options;
    setLoading(true);
    try {
      const searchText = debouncedSearchQuery.trim();
      const parseCreatorNames = (list) =>
        Array.from(
          new Set(
            (Array.isArray(list) ? list : [])
              .map((item) => String(item.created_by || '').trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b, 'zh-CN'));

      const buildBaseParams = () => {
        const base = new URLSearchParams();
        if (statusFilter) base.set('status', statusFilter);
        if (inventoryFilter) base.set('inventory', inventoryFilter);
        if (supplierFilter) base.set('supplier', supplierFilter);
        if (searchText) base.set('search', searchText);
        return base;
      };

      const params = new URLSearchParams({ page: String(page), limit: String(itemsPerPage) });
      if (statusFilter) params.set('status', statusFilter);
      if (inventoryFilter) params.set('inventory', inventoryFilter);
      if (supplierFilter) params.set('supplier', supplierFilter);
      if (creatorFilter) params.set('creator', creatorFilter);
      if (searchText) params.set('search', searchText);

      const productsRes = await apiFetch('/api/products?' + params.toString(), { cache: 'no-store' });

      const productsJson = await productsRes.json();
      if (!productsJson.ok) throw new Error(productsJson.error || '加载失败');
      const pagination = productsJson.pagination || {};
      const serverSupportsCreatorFilter = Array.isArray(productsJson.creators);
      let rowsToShow = Array.isArray(productsJson.data) ? productsJson.data : [];
      let nextTotal = Number(pagination.total || 0);
      let nextTotalPages = Number(pagination.totalPages || 1);
      let usedLegacyCreatorList = false;

      // 兼容旧后端：旧版不支持 creator 参数时，前端执行本地录入人筛选与分页
      if (!serverSupportsCreatorFilter && creatorFilter) {
        const allParams = buildBaseParams();
        allParams.set('page', '1');
        allParams.set('limit', '1000');
        const allRes = await apiFetch('/api/products?' + allParams.toString(), { cache: 'no-store' });
        const allJson = await allRes.json();
        if (allJson.ok) {
          const allRows = Array.isArray(allJson.data) ? allJson.data : [];
          const matchedRows = allRows.filter((item) => String(item.created_by || '').trim() === creatorFilter);
          nextTotal = matchedRows.length;
          nextTotalPages = Math.max(1, Math.ceil(nextTotal / itemsPerPage));
          if (nextTotalPages > 0 && page > nextTotalPages) {
            setCurrentPage(nextTotalPages);
            return;
          }
          const start = (page - 1) * itemsPerPage;
          rowsToShow = matchedRows.slice(start, start + itemsPerPage);
          if (creators.length === 0) {
            setCreators(parseCreatorNames(allRows));
            usedLegacyCreatorList = true;
          }
        }
      }

      if (nextTotalPages > 0 && page > nextTotalPages) {
        setCurrentPage(nextTotalPages);
        return;
      }

      setRows(rowsToShow);
      setTotalItems(nextTotal);
      setTotalPages(Math.max(1, nextTotalPages || 1));
      if (Array.isArray(productsJson.suppliers)) setSuppliers(productsJson.suppliers);
      if (Array.isArray(productsJson.creators)) {
        setCreators(productsJson.creators);
      } else if (!usedLegacyCreatorList && creators.length === 0) {
        try {
          const listRes = await apiFetch('/api/products?page=1&limit=1000', { cache: 'no-store' });
          const listJson = await listRes.json();
          if (listJson.ok) {
            const allCreators = parseCreatorNames(listJson.data);
            if (allCreators.length > 0) {
              setCreators(allCreators);
              usedLegacyCreatorList = true;
            }
          }
        } catch (_) {}
        if (!usedLegacyCreatorList) {
          const fallbackCreators = parseCreatorNames(productsJson.data);
          setCreators(fallbackCreators);
        }
      }

      if (refreshStats || !stats) {
        const statsRes = await apiFetch('/api/stats', { cache: 'no-store' });
        const statsJson = await statsRes.json();
        if (statsJson.ok && statsJson.stats) setStats(statsJson.stats);
      }
    } catch (err) {
      showToast('加载失败: ' + (err.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    loadData(currentPage);
  }, [currentPage, debouncedSearchQuery, statusFilter, inventoryFilter, supplierFilter, creatorFilter, itemsPerPage]);

  useEffect(() => {
    try {
      localStorage.setItem(OPERATOR_STORAGE_KEY, operatorName || '');
    } catch (_) {}
  }, [operatorName]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/runtime', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const role = j?.runtime?.role;
        const mode = j?.runtime?.mode;
        if (cancelled) return;
        if (role === 'local' || role === 'cloud') {
          setRuntimeRole(role);
        }
        if (typeof mode === 'string' && mode) {
          setRuntimeMode(mode);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!showMobile) return;
    setMobileLoading(true);
    setMobileUrl('');
    apiFetch('/api/mobile-url', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || '获取手机地址失败');
        setMobileUrl(j.url || '');
      })
      .catch((e) => showToast('获取手机地址失败: ' + (e.message || '')))
      .finally(() => setMobileLoading(false));
  }, [showMobile]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!toolsMenuRef.current) return;
      if (toolsMenuRef.current.contains(e.target)) return;
      setShowToolsMenu(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!showToolsMenu) return;
    const updateToolsMenuPosition = () => {
      if (typeof window === 'undefined' || window.innerWidth >= 768) return;
      if (!toolsButtonRef.current) return;
      const rect = toolsButtonRef.current.getBoundingClientRect();
      const width = Math.min(240, Math.max(180, window.innerWidth - 24));
      setMobileToolsMenuTop(Math.max(8, rect.bottom + 8));
      setMobileToolsMenuWidth(width);
    };
    updateToolsMenuPosition();
    window.addEventListener('resize', updateToolsMenuPosition);
    window.addEventListener('scroll', updateToolsMenuPosition, true);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateToolsMenuPosition);
    }
    return () => {
      window.removeEventListener('resize', updateToolsMenuPosition);
      window.removeEventListener('scroll', updateToolsMenuPosition, true);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateToolsMenuPosition);
      }
    };
  }, [showToolsMenu]);

  const handleSelectAll = (e) => {
    const checked = e.target.checked;
    const currentIds = rows.map((row) => row.id);
    setSelectedRows((prev) => {
      if (checked) return Array.from(new Set([...prev, ...currentIds]));
      return prev.filter((id) => !currentIds.includes(id));
    });
  };

  const handleSelectRow = (id) => {
    setSelectedRows((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openCreateForm = () => {
    setEditingId(null);
    setFormData(defaultForm(operatorName));
    setShowForm(true);
  };

  const openEditForm = async (id) => {
    setFormLoading(true);
    try {
      const res = await apiFetch('/api/products/' + id, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok || !j.data) throw new Error(j.error || '加载失败');
      const p = j.data;
      setEditingId(id);
      setFormData({
        name: p.name || '',
        expiry_date: p.expiry_date || '',
        quantity: Number(p.quantity || 1),
        specification: p.specification || '',
        unit: p.unit || '',
        supplier: p.supplier || '',
        inventory_status: p.inventory_status || 'pending',
        note: p.note || '',
        created_by: p.created_by || operatorName || '',
      });
      setShowForm(true);
    } catch (err) {
      showToast('加载编辑数据失败: ' + (err.message || ''));
    } finally {
      setFormLoading(false);
    }
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.expiry_date) {
      showToast('请填写产品名称和到期日');
      return;
    }
    try {
      const payload = {
        name: formData.name.trim(),
        expiry_date: formData.expiry_date,
        quantity: Number.parseInt(formData.quantity, 10) || 1,
        specification: formData.specification.trim() || null,
        unit: formData.unit || null,
        supplier: formData.supplier.trim() || null,
        inventory_status: formData.inventory_status || 'pending',
        note: formData.note.trim() || null,
        created_by: formData.created_by.trim() || operatorName || null,
      };
      const url = editingId ? '/api/products/' + editingId : '/api/products';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || (editingId ? '保存失败' : '录入失败'));
      setShowForm(false);
      showToast(editingId ? '已保存' : '已录入');
      loadData(currentPage, { refreshStats: true });
    } catch (err) {
      showToast((editingId ? '保存失败: ' : '录入失败: ') + (err.message || ''));
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`确认删除「${name}」？`)) return;
    try {
      const qs = operatorName.trim() ? '?updated_by=' + encodeURIComponent(operatorName.trim()) : '';
      const res = await apiFetch('/api/products/' + id + qs, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '删除失败');
      showToast('已删除');
      setSelectedRows((prev) => prev.filter((x) => x !== id));
      loadData(currentPage, { refreshStats: true });
    } catch (err) {
      showToast('删除失败: ' + (err.message || ''));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRows.length === 0) return;
    if (!window.confirm(`确认批量删除 ${selectedRows.length} 个产品？`)) return;
    try {
      const res = await apiFetch('/api/products/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedRows, updated_by: operatorName.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '批量删除失败');
      setSelectedRows([]);
      showToast(`已删除 ${j.deleted || 0} 条`);
      loadData(currentPage, { refreshStats: true });
    } catch (err) {
      showToast('批量删除失败: ' + (err.message || ''));
    }
  };

  const handleBatchInventory = async (status) => {
    if (selectedRows.length === 0) return;
    try {
      const res = await apiFetch('/api/products/batch-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedRows, status, updated_by: operatorName.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '批量更新失败');
      setSelectedRows([]);
      showToast(`已更新 ${j.updated || 0} 条为${j.status || invText(status)}`);
      loadData(currentPage, { refreshStats: true });
    } catch (err) {
      showToast('批量更新失败: ' + (err.message || ''));
    }
  };

  const handleUpdateInv = async (id, value) => {
    try {
      const res = await apiFetch('/api/products/' + id + '/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: value, updated_by: operatorName.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '更新失败');
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, inventory_status: value } : row)));
    } catch (err) {
      showToast('更新失败: ' + (err.message || ''));
    }
  };

  const handleSyncAction = async () => {
    if (syncActionBlocked) {
      showToast(runtimeRole === 'cloud' ? '请在本地项目页面执行“同步到本地”' : '当前是本地代理模式；同步需在完整本地服务中执行');
      return;
    }
    try {
      const isLocalRuntime = runtimeRole === 'local';
      const endpoint = isLocalRuntime ? '/api/local-sync' : '/api/cloud-data-sync-to-local';
      const successMsg = isLocalRuntime ? '已完成同步到云端' : '已开始同步云端数据到本地';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const j = await res.json();
      if (res.status === 403) {
        throw new Error(j.error || '同步接口当前不可用');
      }
      if (!res.ok || !j.ok) throw new Error(j.error || '同步失败');
      showToast(successMsg);
      loadData(1, { refreshStats: true });
    } catch (err) {
      showToast('同步失败: ' + (err.message || ''));
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const res = await apiFetch('/api/backup', { cache: 'no-store' });
      if (!res.ok) throw new Error('下载失败');
      const blob = await res.blob();
      const a = document.createElement('a');
      const now = new Date();
      const filename = 'backup_' + now.toISOString().slice(0, 10) + '.json';
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('备份已下载');
    } catch (err) {
      showToast('下载失败: ' + (err.message || ''));
    }
  };

  const handleRestoreFile = async (file) => {
    if (!file) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const previewRes = await apiFetch('/api/backup/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const previewJson = await previewRes.json();
      if (!previewRes.ok || !previewJson.ok) throw new Error(previewJson.error || '预览失败');

      const p = previewJson.preview || {};
      const ok = window.confirm(
        `将恢复 ${p.products_count || 0} 条产品，覆盖当前 ${p.diff?.current_count || 0} 条数据。确认继续？`
      );
      if (!ok) return;

      const restoreRes = await apiFetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const restoreJson = await restoreRes.json();
      if (!restoreRes.ok || !restoreJson.ok) throw new Error(restoreJson.error || '恢复失败');
      showToast(`恢复成功：${restoreJson.restored || 0} 条`);
      setShowBackup(false);
      setSelectedRows([]);
      setCurrentPage(1);
      loadData(1, { refreshStats: true });
    } catch (err) {
      showToast('恢复失败: ' + (err.message || ''));
    } finally {
      setRestoring(false);
      if (restoreFileRef.current) restoreFileRef.current.value = '';
    }
  };

  const handleNormalizeAll = async () => {
    if (!window.confirm('确认规范化全部产品名称和供应商？')) return;
    try {
      const res = await apiFetch('/api/products/normalize-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '规范化失败');
      showToast(`已规范化 ${j.updated || 0} 条`);
      loadData(currentPage, { refreshStats: true });
    } catch (err) {
      showToast('规范化失败: ' + (err.message || ''));
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      setImportResult('请选择 CSV 文件');
      return;
    }
    setImporting(true);
    setImportResult('');
    try {
      const csv = await importFile.text();
      const res = await apiFetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, created_by: operatorName.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '导入失败');
      setImportResult('导入成功 ' + (j.count || 0) + ' 条');
      showToast('导入成功');
      setShowImport(false);
      setImportFile(null);
      loadData(currentPage, { refreshStats: true });
    } catch (err) {
      const msg = '导入失败: ' + (err.message || '');
      setImportResult(msg);
      showToast(msg);
    } finally {
      setImporting(false);
    }
  };

  const openLogs = async () => {
    setShowLogs(true);
    setLogsLoading(true);
    try {
      const res = await apiFetch('/api/logs', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '加载失败');
      setLogs(Array.isArray(j.data) ? j.data : []);
    } catch (err) {
      showToast('日志加载失败: ' + (err.message || ''));
    } finally {
      setLogsLoading(false);
    }
  };

  const openCharts = async () => {
    setShowCharts(true);
    if (trendData.length > 0) return;
    try {
      const res = await apiFetch('/api/products?page=1&limit=200', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '趋势加载失败');
      const data = Array.isArray(j.data) ? j.data : [];
      const map = {};
      data.forEach((item) => {
        const key = String(item.expiry_date || '').slice(0, 7);
        if (!key) return;
        map[key] = (map[key] || 0) + 1;
      });
      const list = Object.keys(map)
        .sort()
        .map((k) => ({ label: k, value: map[k] }));
      setTrendData(list);
    } catch (_) {}
  };

  const goPrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goNext = () => setCurrentPage((p) => Math.min(totalPages, p + 1));
  const pages = getVisiblePages(currentPage, totalPages);
  const barMax = Math.max(1, ...chartRows.map((x) => Number(x.value || 0)));
  const handleSummaryFilter = (filterValue) => {
    const next = filterValue || '';
    setCurrentPage(1);
    setStatusFilter((prev) => (prev === next ? '' : next));
  };
  const renderToolsMenuPanel = (panelClassName, panelStyle) => (
    <div className={panelClassName} style={panelStyle}>
      <button onClick={() => { setShowToolsMenu(false); window.open('/api/export/excel', '_blank'); }} className="w-full px-2.5 py-2 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-all flex items-center gap-2 text-left"><FileSpreadsheet className="w-3.5 h-3.5" /> 导出 Excel</button>
      <button onClick={() => { setShowToolsMenu(false); window.open('/api/export/csv', '_blank'); }} className="w-full px-2.5 py-2 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-all flex items-center gap-2 text-left"><FileText className="w-3.5 h-3.5" /> 导出 CSV</button>
      <div className="w-full h-px bg-zinc-700/50 my-1"></div>
      <button onClick={() => { setShowToolsMenu(false); openLogs(); }} className="w-full px-2.5 py-2 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-all flex items-center gap-2 text-left"><ClipboardList className="w-3.5 h-3.5" /> 操作日志</button>
      <button onClick={() => { setShowToolsMenu(false); setShowMobile(true); }} className="w-full px-2.5 py-2 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-all flex items-center gap-2 text-left"><Smartphone className="w-3.5 h-3.5" /> 手机访问</button>
      <button onClick={() => { setShowToolsMenu(false); openCharts(); }} className="w-full px-2.5 py-2 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-all flex items-center gap-2 text-left"><BarChart2 className="w-3.5 h-3.5" /> 数据图表</button>
      <button onClick={() => { setShowToolsMenu(false); setShowBackup(true); }} className="w-full px-2.5 py-2 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-all flex items-center gap-2 text-left"><Database className="w-3.5 h-3.5" /> 备份与恢复</button>
      <button
        onClick={() => { setShowToolsMenu(false); handleSyncAction(); }}
        disabled={syncActionBlocked}
        title={syncActionBlocked ? '当前代理模式下无法直接执行同步' : ''}
        className={`w-full px-2.5 py-2 rounded-lg text-[11px] transition-all flex items-center gap-2 text-left ${
          syncActionBlocked
            ? 'text-zinc-600 cursor-not-allowed'
            : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50'
        }`}
      ><Cloud className="w-3.5 h-3.5" /> {syncActionLabel}</button>
    </div>
  );

  return (
    <div className="h-screen bg-[#09090B] text-zinc-100 font-sans selection:bg-zinc-100 selection:text-zinc-900 relative overflow-hidden flex flex-col">
      <style>{`
        @keyframes liquid-morph {
          0% { border-radius: 40% 60% 70% 30% / 40% 40% 60% 50%; transform: rotate(0deg) scale(1); }
          34% { border-radius: 70% 30% 50% 50% / 30% 30% 70% 70%; transform: rotate(120deg) scale(1.05); }
          67% { border-radius: 100% 60% 60% 100% / 100% 100% 60% 60%; transform: rotate(240deg) scale(0.95); }
          100% { border-radius: 40% 60% 70% 30% / 40% 40% 60% 50%; transform: rotate(360deg) scale(1); }
        }
        @keyframes orbit-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes orbit-spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes text-float-up {
          0% { transform: translateY(30px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes glow-pulse {
          0% { box-shadow: 0 0 0 0 rgba(232, 139, 106, 0.4), 0 0 15px rgba(232, 139, 106, 0.2); }
          70% { box-shadow: 0 0 0 8px rgba(232, 139, 106, 0), 0 0 25px rgba(232, 139, 106, 0.5); }
          100% { box-shadow: 0 0 0 0 rgba(232, 139, 106, 0), 0 0 15px rgba(232, 139, 106, 0.2); }
        }
        @keyframes orb-float {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
          50% { transform: translate(-3%, 4%) scale(1.05); opacity: 0.8; }
        }
        @keyframes orb-float-reverse {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
          50% { transform: translate(3%, -4%) scale(1.1); opacity: 0.7; }
        }
        @keyframes blur-in-up {
          0% { opacity: 0; filter: blur(8px); transform: translateY(15px); }
          100% { opacity: 1; filter: blur(0px); transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-orb-1 { animation: orb-float 18s ease-in-out infinite; }
        .animate-orb-2 { animation: orb-float-reverse 22s ease-in-out infinite; }
        .animate-row { animation: blur-in-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .animate-fade-in { animation: fade-in .35s ease both; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(24, 24, 27, 0.2); }
        .custom-scrollbar::-webkit-scrollbar-corner { background: rgba(24, 24, 27, 0.2); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #27272a; border-radius: 10px; border: 2px solid #09090B; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #3f3f46; }
      `}</style>

      {introState !== 'done' && (
        <div
          className={`fixed inset-0 z-[100] bg-[#09090B] flex flex-col items-center justify-center gap-10 md:gap-16 overflow-hidden transition-all duration-[800ms] ease-[cubic-bezier(0.25,1,0.5,1)] ${introState === 'exiting' ? 'opacity-0 scale-110 pointer-events-none blur-md' : 'opacity-100 scale-100 blur-0'}`}
        >
          <div className="relative flex items-center justify-center w-56 h-56 md:w-72 md:h-72 mt-8 md:mt-12">
            <div className="absolute w-[160%] h-[160%] rounded-full border-t border-r border-white/10" style={{ animation: 'orbit-spin 30s linear infinite', willChange: 'transform' }}></div>
            <div className="absolute w-[120%] h-[120%] rounded-full border-b border-l border-dashed border-[#E88B6A]/30" style={{ animation: 'orbit-spin-reverse 20s linear infinite', willChange: 'transform' }}></div>
            <div
              className="absolute inset-4 md:inset-6"
              style={{
                animation: 'liquid-morph 12s ease-in-out infinite',
                background: 'radial-gradient(circle at 30% 30%, #E88B6A, #7c3aed, #09090B)',
                boxShadow: 'inset 15px 15px 30px rgba(255,255,255,0.2), inset -15px -15px 30px rgba(0,0,0,0.8), 0 0 60px rgba(232, 139, 106, 0.4)',
                willChange: 'transform, border-radius',
              }}
            ></div>
            <div className="absolute inset-4 bg-[#E88B6A]/20 rounded-full blur-[50px]"></div>
          </div>
          <div
            className="relative z-10 flex flex-col items-center justify-center p-6 md:p-8 w-[85%] max-w-sm rounded-3xl bg-zinc-900/40 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
            style={{ animation: 'text-float-up 1s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards', opacity: 0, willChange: 'transform, opacity' }}
          >
            <h1 className="text-2xl md:text-4xl font-light tracking-tighter text-white mb-1.5 drop-shadow-lg text-center">
              Inventory <br className="md:hidden" />
              <span className="font-medium italic text-transparent bg-clip-text bg-gradient-to-br from-[#fbcfe8] to-[#E88B6A]">Core.</span>
            </h1>
            <p className="text-zinc-400 mb-6 tracking-[0.3em] text-[9px] md:text-[10px] font-semibold uppercase opacity-80 text-center">
              Advanced Lifecycle Tracking
            </p>
            <button
              onClick={handleEnterSystem}
              className="px-8 py-2.5 rounded-full bg-white/10 border border-white/20 text-white font-medium text-[13px] hover:bg-white hover:text-black transition-all duration-500 flex items-center gap-2 group cursor-pointer backdrop-blur-md"
              style={{ animation: 'glow-pulse 3s infinite cubic-bezier(0.66, 0, 0, 1) 1.5s' }}
            >
              进入系统
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      )}

      <div className="fixed top-[-10%] right-[-5%] w-[55vw] h-[55vw] rounded-full bg-gradient-to-br from-[#D97757]/15 to-[#7c3aed]/10 blur-[100px] pointer-events-none z-0 animate-orb-1"></div>
      <div className="fixed bottom-[-15%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-gradient-to-tr from-[#1e293b]/40 to-transparent blur-[90px] pointer-events-none z-0 animate-orb-2"></div>

      <div className={`w-full max-w-screen-2xl mx-auto px-3 sm:px-8 md:px-12 py-2 md:py-4 relative z-10 flex-1 flex flex-col min-h-0 transition-all duration-[1000ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${introState === 'playing' ? 'opacity-0 scale-[0.96] translate-y-8' : 'opacity-100 scale-100 translate-y-0 delay-[100ms]'}`}>
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-2 md:gap-4 mb-2 md:mb-4 shrink-0">
          <div className="flex flex-col relative">
            <div className="absolute -inset-8 bg-gradient-to-r from-[#D97757]/20 to-transparent blur-[40px] opacity-60 pointer-events-none z-0"></div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-light tracking-tighter text-zinc-100 mb-0.5 md:mb-1 relative z-10">
              Inventory <br className="hidden md:block" />
              <span className="font-medium italic text-transparent bg-clip-text bg-gradient-to-br from-zinc-100 to-[#E88B6A]">
                Management.
              </span>
            </h1>
            <p className="hidden sm:flex text-zinc-500 text-[11px] tracking-wide font-light items-center gap-1.5 relative z-10">
              <Activity className="w-3 h-3 text-[#E88B6A]" />
              PRODUCT LIFECYCLE TRACKING
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 relative z-10">
            <button onClick={() => { setImportResult(''); setShowImport(true); }} className="h-8 px-3 rounded-full border border-zinc-800 bg-zinc-900/40 backdrop-blur-sm text-zinc-400 hover:border-zinc-100 hover:bg-zinc-100 hover:text-zinc-900 transition-all duration-300 ease-out flex items-center gap-1.5 text-[11px] font-medium">
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">导入数据</span>
            </button>
            <button onClick={openCreateForm} className="h-8 px-4 rounded-full bg-zinc-100 text-zinc-900 hover:bg-white hover:scale-105 transition-all duration-300 ease-out flex items-center gap-1.5 text-xs font-medium shadow-lg shadow-white/10">
              <Plus className="w-3.5 h-3.5" />
              <span>录入产品</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:flex md:flex-wrap bg-zinc-900/40 border border-zinc-800/60 rounded-xl mb-2 md:mb-4 shrink-0 overflow-hidden backdrop-blur-md divide-y md:divide-y-0 md:divide-x divide-zinc-800/60 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
          {summaryData.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSummaryFilter(item.filterValue)}
              className={`flex-1 min-w-0 md:min-w-[140px] px-3 md:px-5 py-2 md:py-3.5 flex flex-col group text-left transition-colors ${statusFilter === (item.filterValue || '') ? 'bg-zinc-800/65' : 'hover:bg-zinc-800/40'}`}
            >
              <span className="text-[9px] md:text-[10px] text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${item.dotColor || 'bg-current opacity-50'}`}></span>
                {item.title}
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`text-xl md:text-3xl font-light tracking-tighter transition-transform duration-500 group-hover:-translate-y-0.5 ${item.color}`}>
                  {item.count}
                </span>
                <span className="hidden md:inline text-[10px] font-light text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  {item.desc}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2 md:gap-3 mb-2 md:mb-3 shrink-0 relative z-20">
          <div className="flex items-center gap-2 w-full lg:w-auto flex-nowrap overflow-x-auto lg:overflow-visible pb-1">
            <div className="relative w-full sm:w-60 group">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-zinc-100 transition-colors" />
              <input
                type="text"
                placeholder="搜索产品或备注..."
                value={searchQuery}
                onChange={(e) => { setCurrentPage(1); setSearchQuery(e.target.value); }}
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-900/60 backdrop-blur-md border border-zinc-800/80 rounded-full text-[12px] focus:outline-none focus:border-zinc-500 transition-all placeholder:text-zinc-500 font-light text-zinc-100"
              />
            </div>
            <div className="hidden sm:block w-px h-4 bg-zinc-800 mx-1"></div>
            <select value={statusFilter} onChange={(e) => { setCurrentPage(1); setStatusFilter(e.target.value); }} className="h-8 px-3 rounded-full border border-zinc-800/80 bg-zinc-900/40 text-[11px] font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all focus:outline-none shrink-0">
              {STATUS_OPTIONS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
            </select>
            <select value={inventoryFilter} onChange={(e) => { setCurrentPage(1); setInventoryFilter(e.target.value); }} className="h-8 px-3 rounded-full border border-zinc-800/80 bg-zinc-900/40 text-[11px] font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all focus:outline-none shrink-0">
              {INVENTORY_OPTIONS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
            </select>
            <select value={supplierFilter} onChange={(e) => { setCurrentPage(1); setSupplierFilter(e.target.value); }} className="h-8 px-3 rounded-full border border-zinc-800/80 bg-zinc-900/40 text-[11px] font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all focus:outline-none shrink-0">
              <option value="">全部供应商</option>
              {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={creatorFilter} onChange={(e) => { setCurrentPage(1); setCreatorFilter(e.target.value); }} className="h-8 px-3 rounded-full border border-zinc-800/80 bg-zinc-900/40 text-[11px] font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all focus:outline-none shrink-0">
              <option value="">全部录入人</option>
              {creators.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          <div ref={toolsMenuRef} className="relative flex-shrink-0">
            <button ref={toolsButtonRef} onClick={() => setShowToolsMenu((s) => !s)} className="h-8 px-3 rounded-full border border-zinc-800/80 bg-zinc-900/40 text-[11px] font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all flex items-center gap-1.5">
              <MoreHorizontal className="w-3.5 h-3.5" /> 更多工具
            </button>
            {showToolsMenu && (
              <>
                <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowToolsMenu(false)}></div>
                <div className="fixed left-1/2 -translate-x-1/2 z-50 md:hidden" style={{ top: `${mobileToolsMenuTop}px`, width: `${mobileToolsMenuWidth}px` }}>
                  {renderToolsMenuPanel(
                    'w-full overflow-y-auto bg-zinc-800/95 backdrop-blur-xl border border-zinc-700/50 rounded-xl shadow-2xl p-1.5 flex flex-col gap-0.5 animate-fade-in',
                    { maxHeight: `calc(100dvh - ${Math.round(mobileToolsMenuTop + 12)}px)` }
                  )}
                </div>
                <div className="hidden md:block absolute right-0 top-full mt-2 z-50 w-48">
                  {renderToolsMenuPanel('w-full max-h-[55vh] overflow-y-auto bg-zinc-800/95 backdrop-blur-xl border border-zinc-700/50 rounded-xl shadow-2xl p-1.5 flex flex-col gap-0.5 animate-fade-in')}
                </div>
              </>
            )}
          </div>
        </div>

        {selectedRows.length > 0 && (
          <div className="mb-3 p-3 rounded-xl border border-zinc-800/80 bg-zinc-900/35 backdrop-blur-md flex flex-wrap items-center gap-2">
            <span className="text-sm text-zinc-300 mr-1">已选中 {selectedRows.length} 项</span>
            <button onClick={handleBatchDelete} className="px-3 py-1.5 rounded-full text-xs bg-red-950/40 text-red-300 hover:bg-red-900/50 transition-all">批量删除</button>
            <button onClick={() => handleBatchInventory('pending')} className="px-3 py-1.5 rounded-full text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all">批量待入库</button>
            <button onClick={() => handleBatchInventory('in')} className="px-3 py-1.5 rounded-full text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all">批量已入库</button>
            <button onClick={() => handleBatchInventory('out')} className="px-3 py-1.5 rounded-full text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all">批量已出库</button>
            <button onClick={() => setSelectedRows([])} className="px-3 py-1.5 rounded-full text-xs bg-zinc-900 border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-all">取消选择</button>
          </div>
        )}

        <div className="w-full flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="min-w-[1072px] flex-1 flex flex-col h-full bg-zinc-900/20 rounded-xl border border-zinc-800/50 overflow-hidden backdrop-blur-sm not-prose [&_th]:text-left [&_td]:text-left">
            <div className="shrink-0 bg-zinc-900/45 border-b border-zinc-800/80">
              <table className="w-full table-fixed text-left border-collapse min-w-[1072px]">
                <colgroup>
                  <col className="w-16" />
                  <col className="w-52" />
                  <col className="w-32" />
                  <col className="w-28" />
                  <col className="w-32" />
                  <col className="w-20" />
                  <col className="w-20" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-20" />
                </colgroup>
                <thead>
                  <tr className="bg-zinc-900/50 text-left text-[11px] font-medium tracking-wider text-zinc-500">
                    <th className="px-6 py-2.5 text-left font-medium border-b border-zinc-800/80">
                      <input type="checkbox" onChange={handleSelectAll} checked={allCurrentSelected} className="w-3.5 h-3.5 rounded border-zinc-700 text-zinc-100 focus:ring-zinc-100 cursor-pointer accent-zinc-100" />
                    </th>
                    <th className="px-6 py-2.5 text-left font-medium border-b border-zinc-800/80">产品名称</th>
                    <th className="px-6 py-2.5 text-left font-medium border-b border-zinc-800/80">到期日</th>
                    <th className="px-6 py-2.5 text-left font-medium border-b border-zinc-800/80">状态</th>
                    <th className="px-6 py-2.5 text-left font-medium border-b border-zinc-800/80">出入库</th>
                    <th className="px-6 py-2.5 text-left font-medium border-b border-zinc-800/80">数量</th>
                    <th className="px-6 py-2.5 text-left font-medium border-b border-zinc-800/80">规格</th>
                    <th className="px-6 py-2.5 text-left font-medium border-b border-zinc-800/80">供应商</th>
                    <th className="px-6 py-2.5 text-left font-medium border-b border-zinc-800/80">录入人</th>
                    <th className="px-6 py-2.5 text-right font-medium border-b border-zinc-800/80">操作</th>
                  </tr>
                </thead>
              </table>
            </div>

            <div className={`flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-zinc-900/20 transition-opacity duration-200 ${loading ? 'opacity-95' : 'opacity-100'}`} style={{ scrollbarGutter: 'stable both-edges' }}>
              <table className="w-full table-fixed text-left border-collapse min-w-[1072px]">
                <colgroup>
                  <col className="w-16" />
                  <col className="w-52" />
                  <col className="w-32" />
                  <col className="w-28" />
                  <col className="w-32" />
                  <col className="w-20" />
                  <col className="w-20" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-20" />
                </colgroup>
                <tbody>
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan="10" className="px-6 py-8 text-left whitespace-nowrap text-zinc-500 text-sm">暂无数据</td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onMouseEnter={() => setHoveredRow(row.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                      className={`group ${selectedRows.includes(row.id) ? 'bg-zinc-800/80' : 'hover:bg-zinc-800/40'}`}
                    >
                      <td className="px-6 py-3 text-left whitespace-nowrap">
                        <input type="checkbox" checked={selectedRows.includes(row.id)} onChange={() => handleSelectRow(row.id)} className="w-3.5 h-3.5 rounded border-zinc-700 text-zinc-100 focus:ring-zinc-100 cursor-pointer accent-zinc-100" />
                      </td>
                      <td className="px-6 py-3 text-left whitespace-nowrap">
                        <div className="font-medium text-zinc-100 flex items-center gap-3 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 ${hoveredRow === row.id ? 'bg-zinc-200 text-zinc-900 shadow-sm' : 'bg-zinc-800 text-zinc-400'}`}>
                            <Box className="w-3.5 h-3.5" />
                          </div>
                          <span className="truncate text-xs tracking-wide">{row.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-left whitespace-nowrap text-[11px] font-mono font-light text-zinc-400 tracking-wider">{formatDateDot(row.expiry_date)}</td>
                      <td className="px-6 py-3 text-left whitespace-nowrap"><StatusBadge status={row.status} /></td>
                      <td className="px-6 py-3 text-left whitespace-nowrap">
                        <select value={row.inventory_status || 'pending'} onChange={(e) => handleUpdateInv(row.id, e.target.value)} className="px-3 py-1.5 rounded-full border border-zinc-700 bg-zinc-900/70 text-xs text-zinc-300 focus:outline-none">
                          <option value="pending">待入库</option>
                          <option value="in">已入库</option>
                          <option value="out">已出库</option>
                        </select>
                      </td>
                      <td className="px-6 py-3 text-left whitespace-nowrap text-xs font-light text-zinc-200">{formatQuantityWithUnit(row.quantity, row.unit)}</td>
                      <td className="px-6 py-3 text-left whitespace-nowrap text-xs font-light text-zinc-400">{formatSpecification(row.specification, row.quantity, row.unit)}</td>
                      <td className="px-6 py-3 text-left whitespace-nowrap text-xs font-light text-zinc-400">{row.supplier || '-'}</td>
                      <td className="px-6 py-3 text-left whitespace-nowrap">
                        {(row.created_by && row.created_by !== '-') ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 border border-zinc-600/50 shadow-inner text-zinc-200 flex items-center justify-center text-[10px] font-medium shrink-0">{row.created_by.charAt(0)}</div>
                            <span className="text-[11px] font-light text-zinc-400 truncate">{row.created_by}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] font-light text-zinc-600">-</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <div className={`inline-flex items-center gap-0.5 transition-all duration-300 ${hoveredRow === row.id ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'}`}>
                          <button onClick={() => openEditForm(row.id)} className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-500 hover:text-zinc-100 transition-colors" title="编辑">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(row.id, row.name)} className="p-1.5 rounded-md hover:bg-red-500/10 text-zinc-500 hover:text-rose-400 transition-colors" title="删除">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="hidden md:flex mt-auto pt-3 pb-3 px-4 border-t border-zinc-800/80 bg-zinc-900/30 items-center justify-between animate-fade-in shrink-0">
              <div className="flex items-center gap-4">
                <span className="text-[11px] text-zinc-500 font-light hidden sm:inline-block">
                  Showing <span className="font-medium text-zinc-300">{totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium text-zinc-300">{Math.min(currentPage * itemsPerPage, totalItems)}</span> of <span className="font-medium text-zinc-300">{totalItems}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500">每页:</span>
                  <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 text-[11px] rounded-full focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500 block px-2.5 py-1 outline-none cursor-pointer transition-all hover:bg-zinc-700/50">
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button onClick={goPrev} disabled={currentPage === 1} className="w-8 h-8 rounded-full flex items-center justify-center border border-zinc-700/50 bg-zinc-800/30 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 transition-all disabled:opacity-30 disabled:pointer-events-none">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-1 px-1">
                  {pages.map((p, idx) => (
                    p === '...'
                      ? <span key={'gap-' + idx} className="w-7 text-center text-zinc-600">...</span>
                      : (
                        <button key={p} onClick={() => setCurrentPage(p)} className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium transition-all duration-200 ${currentPage === p ? 'bg-zinc-200 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'}`}>
                          {p}
                        </button>
                      )
                  ))}
                </div>
                <button onClick={goNext} disabled={currentPage === totalPages || totalPages === 0} className="w-8 h-8 rounded-full flex items-center justify-center border border-zinc-700/50 bg-zinc-800/30 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 transition-all disabled:opacity-30 disabled:pointer-events-none">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="md:hidden mt-2 px-1 pb-1 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-500">每页</span>
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="h-8 px-2.5 rounded-full border border-zinc-700/50 bg-zinc-800/30 text-zinc-300 text-xs focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[11px] text-zinc-500">第 {currentPage} / {Math.max(1, totalPages)} 页</span>
            <button onClick={goPrev} disabled={currentPage === 1} className="h-8 px-3 rounded-full border border-zinc-700/50 bg-zinc-800/30 text-zinc-300 text-xs disabled:opacity-30 disabled:pointer-events-none">
              上一页
            </button>
            <button onClick={goNext} disabled={currentPage === totalPages || totalPages === 0} className="h-8 px-3 rounded-full border border-zinc-700/50 bg-zinc-800/30 text-zinc-300 text-xs disabled:opacity-30 disabled:pointer-events-none">
              下一页
            </button>
          </div>
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editingId ? '编辑产品' : '录入产品'} mobileNoScroll={true}>
        <p className="hidden sm:block mb-2 text-[11px] sm:text-xs leading-4 text-zinc-400">
          {editingId ? '用于修改已有产品信息，调整后点击“保存修改”生效。' : '用于新增单条产品，填写必填项后点击“确认录入”即可保存。'}
        </p>
        {formLoading ? (
          <div className="text-sm text-zinc-400">加载中...</div>
        ) : (
          <form onSubmit={submitForm} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="text-xs text-zinc-400">产品名称 *</label>
                <input value={formData.name} onChange={(e) => setFormData((s) => ({ ...s, name: e.target.value }))} className="mt-1 w-full h-8.5 sm:h-9 px-3 rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 text-[16px] sm:text-sm focus:outline-none focus:border-zinc-500" />
              </div>
              <div className="col-span-2 sm:col-span-1 min-w-0">
                <label className="text-xs text-zinc-400">到期日 *</label>
                <input type="date" value={formData.expiry_date} onChange={(e) => setFormData((s) => ({ ...s, expiry_date: e.target.value }))} className="mt-1 block w-full min-w-0 h-8.5 sm:h-9 px-2 rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 text-[16px] sm:text-sm focus:outline-none focus:border-zinc-500" />
              </div>
              <div className="col-span-2 sm:col-span-1 min-w-0">
                <label className="text-xs text-zinc-400">数量</label>
                <input type="number" min="1" value={formData.quantity} onChange={(e) => setFormData((s) => ({ ...s, quantity: e.target.value }))} className="mt-1 block w-full min-w-0 h-8.5 sm:h-9 px-2 rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 text-[16px] sm:text-sm focus:outline-none focus:border-zinc-500" />
              </div>
              <div className="col-span-2 sm:col-span-1 min-w-0">
                <label className="text-xs text-zinc-400">规格</label>
                <input value={formData.specification} placeholder="如 8ml / 10g" onChange={(e) => setFormData((s) => ({ ...s, specification: e.target.value }))} className="mt-1 block w-full min-w-0 h-8.5 sm:h-9 px-2 rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 text-[16px] sm:text-sm focus:outline-none focus:border-zinc-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-400">数量单位</label>
                <select value={formData.unit} onChange={(e) => setFormData((s) => ({ ...s, unit: e.target.value }))} className="mt-1 w-full h-8.5 sm:h-9 px-2.5 rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 text-[16px] sm:text-sm focus:outline-none focus:border-zinc-500">
                  {UNIT_OPTIONS.map((option) => (
                    <option key={option.value || 'empty'} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400">供应商</label>
                <input value={formData.supplier} onChange={(e) => setFormData((s) => ({ ...s, supplier: e.target.value }))} className="mt-1 w-full h-8.5 sm:h-9 px-2.5 rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 text-[16px] sm:text-sm focus:outline-none focus:border-zinc-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-400">出入库</label>
                <select value={formData.inventory_status} onChange={(e) => setFormData((s) => ({ ...s, inventory_status: e.target.value }))} className="mt-1 w-full h-8.5 sm:h-9 px-2.5 rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 text-[16px] sm:text-sm focus:outline-none focus:border-zinc-500">
                  <option value="pending">待入库</option>
                  <option value="in">已入库</option>
                  <option value="out">已出库</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400">录入人</label>
                <input value={formData.created_by} onChange={(e) => setFormData((s) => ({ ...s, created_by: e.target.value }))} className="mt-1 w-full h-8.5 sm:h-9 px-2.5 rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 text-[16px] sm:text-sm focus:outline-none focus:border-zinc-500" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-400">备注</label>
                <textarea value={formData.note} onChange={(e) => setFormData((s) => ({ ...s, note: e.target.value }))} rows={1} className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 text-[16px] sm:text-sm focus:outline-none focus:border-zinc-500 resize-none min-h-[42px]" />
              </div>
            </div>
            <div className="sticky bottom-[-10px] sm:bottom-0 -mx-2.5 sm:mx-0 px-2.5 sm:px-0 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+4px)] bg-gradient-to-t from-zinc-900 via-zinc-900 to-transparent">
              <div className="flex items-center justify-end gap-2.5">
                <button type="button" onClick={() => setShowForm(false)} className="h-9 min-w-[120px] px-5 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-[13px] sm:text-sm">取消</button>
                <button type="submit" className="h-9 min-w-[150px] px-6 rounded-full bg-zinc-100 text-zinc-900 hover:bg-white text-[13px] sm:text-sm">{editingId ? '保存修改' : '确认录入'}</button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="批量导入 CSV">
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">用于一次性录入多条产品：先下载模板，按格式填写后上传 CSV 并开始导入。</p>
          <p className="text-sm text-zinc-400">表头示例：产品名,到期日,数量,规格,数量单位,供应商,出入库（pending/in/out）</p>
          <div className="flex gap-2">
            <button onClick={() => window.open('/api/template', '_blank')} className="px-3 py-2 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm">下载模板</button>
          </div>
          <input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="block w-full text-sm text-zinc-300" />
          {importResult && <div className="text-sm text-zinc-400">{importResult}</div>}
          <div className="pt-1 flex justify-end gap-2">
            <button onClick={() => setShowImport(false)} className="px-4 py-2 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800">取消</button>
            <button onClick={handleImport} disabled={importing} className="px-4 py-2 rounded-full bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-50">{importing ? '导入中...' : '开始导入'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={showBackup} onClose={() => setShowBackup(false)} title="备份与恢复">
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">下载备份用于留档；从备份恢复会覆盖当前数据；规范化用于统一产品名称与供应商写法。</p>
          <p className="text-sm text-zinc-400">建议定期下载 JSON 备份，恢复前先确认当前数据已另行保存。</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleDownloadBackup} className="px-3 py-2 rounded-full bg-zinc-100 text-zinc-900 hover:bg-white text-sm">下载备份</button>
            <button onClick={() => restoreFileRef.current && restoreFileRef.current.click()} disabled={restoring} className="px-3 py-2 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm disabled:opacity-50">{restoring ? '恢复中...' : '从备份恢复'}</button>
            <button onClick={handleNormalizeAll} className="px-3 py-2 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm flex items-center gap-1"><RotateCcw className="w-3 h-3" />规范化全部</button>
          </div>
          <input
            ref={restoreFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => handleRestoreFile(e.target.files?.[0])}
          />
        </div>
      </Modal>

      <Modal open={showLogs} onClose={() => setShowLogs(false)} title="操作日志" widthClass="max-w-3xl">
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">用于追踪系统操作记录，包含操作类型、详情、时间和执行人。</p>
          <div className="max-h-[420px] overflow-y-auto border border-zinc-800 rounded-xl">
            {logsLoading && <div className="p-4 text-sm text-zinc-400">加载中...</div>}
            {!logsLoading && logs.length === 0 && <div className="p-4 text-sm text-zinc-500">暂无日志</div>}
            {!logsLoading && logs.map((log) => (
              <div key={log.id} className="px-4 py-3 border-b border-zinc-800 last:border-b-0">
                <div className="text-sm text-zinc-200">
                  <span className="font-medium">{log.action}</span>
                  <span className="text-zinc-400 ml-2">{log.detail || '-'}</span>
                </div>
                <div className="text-xs text-zinc-500 mt-1">{log.created_at || '-'} · {log.created_by || '-'}</div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={showMobile} onClose={() => setShowMobile(false)} title="手机访问">
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">可通过链接或二维码在手机端打开当前系统，复制地址后可分享给同一网络内成员。</p>
          {mobileLoading ? (
            <div className="text-sm text-zinc-400">获取中...</div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input value={mobileUrl} readOnly className="flex-1 px-3 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 bg-zinc-950" />
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(mobileUrl);
                      showToast('已复制地址');
                    } catch (_) {
                      showToast('复制失败');
                    }
                  }}
                  className="px-3 py-2 rounded-full border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  复制
                </button>
              </div>
              {mobileUrl ? (
                <div className="flex justify-center p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                  <img alt="mobile-qr" src={'/api/qr?url=' + encodeURIComponent(mobileUrl) + '&w=220'} className="w-[220px] h-[220px]" />
                </div>
              ) : (
                <div className="text-sm text-zinc-400">未获取到地址</div>
              )}
            </>
          )}
        </div>
      </Modal>

      <Modal open={showCharts} onClose={() => setShowCharts(false)} title="数据图表" widthClass="max-w-4xl">
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">用于查看库存结构与到期趋势，点击上方标签可切换不同统计维度。</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setActiveChart('status')} className={`px-3 py-1.5 rounded-full text-xs ${activeChart === 'status' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400'}`}>状态分布</button>
            <button onClick={() => setActiveChart('supplier')} className={`px-3 py-1.5 rounded-full text-xs ${activeChart === 'supplier' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400'}`}>供应商分布</button>
            <button onClick={() => setActiveChart('inventory')} className={`px-3 py-1.5 rounded-full text-xs ${activeChart === 'inventory' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400'}`}>出入库分布</button>
            <button onClick={() => setActiveChart('trend')} className={`px-3 py-1.5 rounded-full text-xs ${activeChart === 'trend' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400'}`}>到期趋势</button>
          </div>
          <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-950/60 max-h-[420px] overflow-auto">
            {chartRows.length === 0 && <div className="text-sm text-zinc-500">暂无数据</div>}
            {chartRows.length > 0 && (
              <div className="space-y-2">
                {chartRows.map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="w-24 text-xs text-zinc-400 truncate">{item.label}</div>
                    <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-zinc-100/80 rounded-full" style={{ width: `${Math.max(4, Math.round((Number(item.value || 0) / barMax) * 100))}%` }}></div>
                    </div>
                    <div className="w-10 text-right text-xs text-zinc-300">{item.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 px-4 py-2 rounded-full bg-zinc-900 text-white text-sm shadow-lg z-[120] animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

const mountEl = document.getElementById('root');
if (ReactDOM.createRoot) {
  ReactDOM.createRoot(mountEl).render(<App />);
} else {
  ReactDOM.render(<App />, mountEl);
}
