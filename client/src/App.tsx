import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  Barcode,
  ChevronDown,
  Check,
  Coffee,
  CreditCard,
  Folder,
  GlassWater,
  GripVertical,
  ImagePlus,
  LayoutGrid,
  Menu,
  Minus,
  MoreVertical,
  PackageOpen,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShoppingBag,
  Pencil,
  Power,
  Printer,
  Smartphone,
  Upload,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const buildLabel = import.meta.env.VITE_BUILD_LABEL ?? "Versión v0.1.0 · 13/08/2026 16:50";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "No se pudo completar la operación.");
  return body as T;
}

type Category = { id: number; name: string; color: string; imageUrl: string | null; iconName: string; sortOrder: number; isFeatured: boolean; isActive?: boolean };
type VatType = { id: number; name: string; rate: string; sortOrder: number; isActive: boolean };
type Product = {
  id: number;
  categoryId: number;
  categoryName: string;
  vatTypeId: number | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  imageUrl: string | null;
  unit: string;
  salePrice: string;
  vatRate: string;
  stock: string;
  isFeatured?: boolean;
};
type CartLine = Product & { quantity: number };

type CheckoutResult = { saleNumber: string; totalAmount: string; changeAmount: string; paymentMethod: "cash" | "card" };

const categoryIcons: Record<string, typeof Coffee> = {
  Coffee,
  UtensilsCrossed,
  ShoppingBag,
  GlassWater,
  Folder,
  Package: ShoppingBag,
};

function CategoryVisual({ category, compact = false }: { category: Category; compact?: boolean }) {
  const Icon = categoryIcons[category.iconName] ?? categoryIcons[category.name] ?? Folder;
  if (category.imageUrl) return <img className={compact ? "category-visual category-visual--compact" : "category-visual"} src={category.imageUrl} alt="" />;
  return <Icon className={compact ? "category-visual-icon category-visual-icon--compact" : "category-visual-icon"} strokeWidth={1.6} aria-hidden="true" />;
}

function ProductImage({ product, compact = false }: { product: Product; compact?: boolean }) {
  if (product.imageUrl) {
    return <img className={compact ? "product-image product-image--compact" : "product-image"} src={product.imageUrl} alt={product.name} loading="lazy" />;
  }
  const Icon = product.categoryName.toLowerCase().includes("café") ? Coffee : product.categoryName.toLowerCase().includes("comida") ? UtensilsCrossed : ShoppingBag;
  return (
    <div className={compact ? "product-fallback product-fallback--compact" : "product-fallback"} aria-label={`Imagen pendiente de ${product.name}`}>
      <Icon strokeWidth={1.6} />
    </div>
  );
}

function ProductTile({ product, onAdd }: { product: Product; onAdd: (product: Product) => void }) {
  const stock = Number(product.stock);
  return (
    <button className="product-tile" onClick={() => onAdd(product)} disabled={stock <= 0} title={stock <= 0 ? "Sin existencias" : `Añadir ${product.name}`}>
      <ProductImage product={product} />
      <span className="product-tile__overlay"><span>{product.name}</span><small>{stock <= 0 ? "Sin stock" : `${euro.format(Number(product.salePrice))} · ${stock} ${product.unit}`}</small></span>
    </button>
  );
}

function CheckoutDialog({ cart, total, onClose, onComplete }: { cart: CartLine[]; total: number; onClose: () => void; onComplete: (method: "cash" | "card", tendered?: number, reference?: string) => void }) {
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const [tendered, setTendered] = useState(String(total.toFixed(2)));
  const tenderedValue = Number(tendered.replace(",", ".")) || 0;
  const change = Math.max(0, tenderedValue - total);
  const quickAmounts = [Math.ceil(total), Math.ceil(total) + 1, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10].filter((amount, index, list) => amount > 0 && list.indexOf(amount) === index).slice(0, 4);
  return (
    <div className="checkout-screen" role="dialog" aria-modal="true" aria-labelledby="payment-title">
      <aside className="checkout-ticket"><header><h2>Ticket</h2><button className="icon-button" onClick={onClose} aria-label="Volver al ticket"><ArrowLeft size={20} /></button></header><div className="checkout-ticket__lines">{cart.map((line) => <div key={line.id}><span>{line.name} <small>x {line.quantity}</small></span><strong>{euro.format(Number(line.salePrice) * line.quantity)}</strong></div>)}</div><div className="checkout-ticket__tax">Impuesto (incluido)</div><div className="checkout-ticket__total"><strong>Total</strong><strong>{euro.format(total)}</strong></div></aside>
      <section className="checkout-payment">
        <header className="checkout-payment__header"><button className="checkout-back" onClick={onClose}><ArrowLeft size={24} /></button><span>PAGO</span></header>
        <div className="checkout-payment__body"><h1 id="payment-title">{euro.format(total)}</h1><p>Cantidad total a pagar</p><div className="checkout-tabs"><button className={method === "cash" ? "checkout-tab checkout-tab--active" : "checkout-tab"} onClick={() => setMethod("cash")}><Banknote size={18} /> Efectivo</button><button className={method === "card" ? "checkout-tab checkout-tab--active" : "checkout-tab"} onClick={() => setMethod("card")}><CreditCard size={18} /> Tarjeta</button></div>{method === "cash" ? <><label className="checkout-money-field"><span>Efectivo recibido</span><div><Banknote size={22} /><input inputMode="decimal" value={tendered} onChange={(event) => setTendered(event.target.value)} autoFocus /><b>€</b></div></label><div className="quick-cash">{quickAmounts.map((amount) => <button key={amount} onClick={() => setTendered(amount.toFixed(2))}>{euro.format(amount)}</button>)}</div><div className="checkout-change"><span>Cambio</span><strong>{euro.format(change)}</strong></div><button className="pay-confirm-button" disabled={tenderedValue < total} onClick={() => onComplete("cash", tenderedValue)}><Banknote size={21} /> Cobrar en efectivo</button></> : <button className="card-fast-pay" onClick={() => onComplete("card")}><CreditCard size={58} /><strong>PAGO CON TARJETA</strong><span>Confirma el pago en el datáfono y pulsa aquí para registrarlo</span></button>}</div>
      </section>
    </div>
  );
}

function PosScreen() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [order, setOrder] = useState<"popular" | "alphabetical">("popular");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [isPaying, setIsPaying] = useState(false);
  const [ticketMenuOpen, setTicketMenuOpen] = useState(false);

  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  const catalogQuery = useQuery({
    queryKey: ["catalog", selectedCategory, order],
    queryFn: () => api<Product[]>(`/catalog?order=${order}${selectedCategory ? `&categoryId=${selectedCategory}` : ""}`),
  });
  const featuredQuery = useQuery({ queryKey: ["featured"], queryFn: () => api<Product[]>("/catalog/featured"), enabled: selectedCategory === null });
  const checkoutMutation = useMutation({
    mutationFn: (payload: { method: "cash" | "card"; tendered?: number; reference?: string }) => api<CheckoutResult>("/checkout", {
      method: "POST",
      body: JSON.stringify({
        lines: cart.map((line) => ({ productId: line.id, quantity: line.quantity })),
        paymentMethod: payload.method,
        receivedAmount: payload.tendered,
        terminalReference: payload.reference,
      }),
    }),
    onSuccess: (result) => {
      setCart([]);
      setIsPaying(false);
      toast.success(`Venta ${result.saleNumber} guardada`, { description: result.changeAmount !== "0.00" ? `Cambio: ${euro.format(Number(result.changeAmount))}` : `${euro.format(Number(result.totalAmount))} · ${result.paymentMethod === "card" ? "Tarjeta" : "Efectivo"}` });
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
      queryClient.invalidateQueries({ queryKey: ["featured"] });
      queryClient.invalidateQueries({ queryKey: ["cash"] });
      if (result.paymentMethod === "cash") void openDrawer("cash_sale");
    },
    onError: (error) => toast.error("No se ha podido finalizar la venta", { description: error.message }),
  });

  const openDrawer = async (reason: "cash_sale" | "manual") => {
    try {
      const result = await api<{ supported: boolean; opened?: boolean; message: string }>("/hardware/drawer/open", { method: "POST", body: JSON.stringify({ reason }) });
      if (result.opened) toast.success("Cajón abierto");
      else toast.message("Cajón no configurado", { description: result.message });
    } catch (error) {
      toast.error("No se ha podido abrir el cajón", { description: error instanceof Error ? error.message : "Error de comunicación" });
    }
  };

  const allProducts = selectedCategory === null ? (featuredQuery.data ?? catalogQuery.data ?? []) : (catalogQuery.data ?? []);
  const visibleProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    if (!term) return allProducts;
    return allProducts.filter((product) => `${product.name} ${product.sku ?? ""}`.toLocaleLowerCase("es").includes(term));
  }, [allProducts, search]);
  const totalUnits = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + Number(line.salePrice) * line.quantity, 0);

  const addToCart = (product: Product) => {
    if (Number(product.stock) <= 0) return;
    setCart((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing) {
        if (existing.quantity >= Number(product.stock)) {
          toast.message("No hay más unidades disponibles", { description: product.name });
          return current;
        }
        return current.map((line) => line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, { ...product, quantity: 1 }];
    });
  };
  const updateCartQuantity = (productId: number, delta: number) => {
    setCart((current) => current.flatMap((line) => {
      if (line.id !== productId) return [line];
      const next = line.quantity + delta;
      if (next <= 0) return [];
      if (next > Number(line.stock)) return [line];
      return [{ ...line, quantity: next }];
    }));
  };

  return (
    <main className="pos-shell">
      <section className="catalog-panel">
        <header className="pos-header">
          <div className="pos-header__left">{selectedCategory !== null ? <button className="pos-header__icon" onClick={() => setSelectedCategory(null)} aria-label="Volver a familias"><ArrowLeft size={26} /></button> : <button className="pos-header__icon" aria-label="Menú principal"><Menu size={26} /></button>}<div className="pos-header__title"><strong>PÁGINA: 1{selectedCategory !== null ? `  ›  ${categoriesQuery.data?.find((category) => category.id === selectedCategory)?.name ?? "Familia"}` : ""}</strong><small>Sweet &amp; Salty</small></div></div>
          <div className="header-actions"><button className="pos-header__icon" aria-label="Buscar"><Search size={25} /></button><span className="register-status"><i /> Caja abierta</span></div>
        </header>
        <div className="catalog-toolbar">
          <div><span className="eyebrow">VENTA RÁPIDA</span><h1>{selectedCategory ? categoriesQuery.data?.find((category) => category.id === selectedCategory)?.name : "Familias y destacados"}</h1></div>
          <div className="toolbar-actions">
            <label className="search-field"><Search size={18} /><input placeholder="Buscar artículo o código" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
            <button className="sort-button" onClick={() => setOrder((current) => current === "popular" ? "alphabetical" : "popular")}><span>{order === "popular" ? "Más vendidos" : "A–Z"}</span><ChevronDown size={16} /></button>
          </div>
        </div>

        {selectedCategory === null && (
          <section className="families-section">
            <div className="section-heading"><h2>Familias</h2><span>{categoriesQuery.data?.length ?? 0} grupos</span></div>
            <div className="family-grid">
               {categoriesQuery.isLoading ? <div className="empty-inline">Cargando familias…</div> : categoriesQuery.data?.map((category) => <button key={category.id} className={category.imageUrl ? "family-card family-card--image" : "family-card"} onClick={() => setSelectedCategory(category.id)} style={{ "--family-color": category.color } as React.CSSProperties}>{category.imageUrl && <span className="family-card__image" style={{ backgroundImage: `url(${category.imageUrl})` }} />}{!category.imageUrl && <CategoryVisual category={category} compact />}<span>{category.name}</span><Plus size={16} /></button>)}
            </div>
          </section>
        )}

        <section className="products-section">
          <div className="section-heading"><h2>{selectedCategory === null ? "Más vendidos" : "Artículos"}</h2>{selectedCategory !== null && <button className="text-button" onClick={() => setSelectedCategory(null)}>Volver a familias</button>}</div>
          <div className="product-grid">
            {(catalogQuery.isLoading || featuredQuery.isLoading) && <div className="empty-products">Cargando catálogo…</div>}
            {!catalogQuery.isLoading && !featuredQuery.isLoading && visibleProducts.length === 0 && <div className="empty-products"><PackageOpen size={32} /><strong>No hay artículos para mostrar</strong><span>Comprueba el filtro o crea productos en Administración.</span></div>}
            {visibleProducts.map((product) => <ProductTile key={product.id} product={product} onAdd={addToCart} />)}
          </div>
        </section>
      </section>

      <aside className="ticket-panel">
        <header className="ticket-header"><div><span className="eyebrow">TICKET ACTUAL</span><h2>Ticket</h2></div><div className="ticket-header__actions"><button className="icon-button" disabled={!cart.length} onClick={() => setCart([])} aria-label="Vaciar ticket"><Trash2 size={19} /></button><div className="ticket-menu-wrap"><button className="icon-button" onClick={() => setTicketMenuOpen((open) => !open)} aria-label="Más acciones"><MoreVertical size={20} /></button>{ticketMenuOpen && <div className="ticket-menu"><button disabled={!cart.length} onClick={() => { setCart([]); setTicketMenuOpen(false); }}><Trash2 size={16} /> Despejar el ticket</button><button disabled><ReceiptText size={16} /> Editar ticket</button><button disabled><PackageOpen size={16} /> Dividir ticket</button><button onClick={() => { void openDrawer("manual"); setTicketMenuOpen(false); }}><Banknote size={16} /> Abrir cajón</button></div>}</div></div></header>
        <div className="ticket-lines">
          {cart.length === 0 ? <div className="empty-ticket"><div><ReceiptText size={28} /></div><strong>El ticket está vacío</strong><span>Selecciona artículos del catálogo para empezar.</span></div> : cart.map((line) => <article className="ticket-line" key={line.id}><ProductImage product={line} compact /><div className="ticket-line__info"><strong>{line.name}</strong><span>{euro.format(Number(line.salePrice))} · {line.unit}</span><div className="quantity-control"><button onClick={() => updateCartQuantity(line.id, -1)} aria-label={`Restar ${line.name}`}><Minus size={15} /></button><span>{line.quantity}</span><button onClick={() => updateCartQuantity(line.id, 1)} aria-label={`Sumar ${line.name}`}><Plus size={15} /></button></div></div><div className="ticket-line__total"><strong>{euro.format(Number(line.salePrice) * line.quantity)}</strong><button onClick={() => updateCartQuantity(line.id, -line.quantity)} aria-label={`Eliminar ${line.name}`}><X size={16} /></button></div></article>)}
        </div>
        <footer className="ticket-footer"><div className="ticket-summary"><div><span>Subtotal</span><strong>{euro.format(cartTotal)}</strong></div><div><span>IVA incluido</span><strong>{euro.format(cart.reduce((sum, line) => { const rate = Number(line.vatRate); return sum + (Number(line.salePrice) * line.quantity * rate) / (100 + rate); }, 0))}</strong></div><div className="ticket-total"><span>Total</span><strong>{euro.format(cartTotal)}</strong></div></div><div className="ticket-footer__actions"><button className="save-ticket-button" disabled={!cart.length} onClick={() => toast.message("Los tickets abiertos se incorporarán en una fase posterior")}>Guardar</button><button className="charge-button" disabled={!cart.length || checkoutMutation.isPending} onClick={() => setIsPaying(true)}>{checkoutMutation.isPending ? "Procesando…" : <><CreditCard size={20} /> Cobrar {cart.length ? euro.format(cartTotal) : ""}</>}</button></div><div className="ticket-footnote"><Barcode size={14} /> Escanea un código o usa la búsqueda</div></footer>
      </aside>
      {isPaying && <CheckoutDialog cart={cart} total={cartTotal} onClose={() => !checkoutMutation.isPending && setIsPaying(false)} onComplete={(method, tendered, reference) => checkoutMutation.mutate({ method, tendered, reference })} />}
    </main>
  );
}

type AdminProduct = Product & { lastPurchaseCost: string; weightedAverageCost: string; minimumStock: string; isFeatured: boolean; isActive: boolean; updatedAt: string };
type Supplier = { id: number; name: string; legalName: string | null; taxId: string | null; phone: string | null; email: string | null; isActive: boolean };
type SaleRow = { id: number; saleNumber: string; totalAmount: string; status: string; createdAt: string; method: "cash" | "card" | null };
type SaleDetails = { id: number; saleNumber: string; subtotal: string; vatAmount: string; totalAmount: string; status: string; createdAt: string; payment: { method: "cash" | "card"; amount: string; receivedAmount: string | null; changeAmount: string; terminalReference: string | null } | null; lines: Array<{ id: number; productName: string; quantity: string; unitPrice: string; lineVat: string; lineTotal: string }> };
type ReportRow = { productId: number | null; productName: string; units: string; revenue: string; cost: string; margin: string };
type PurchaseRow = { id: number; invoiceNumber: string | null; invoiceDate: string | null; totalAmount: string; ocrStatus: string; status: string; supplierName: string | null; createdAt: string };
type RecognizedInvoiceLine = { lineId: number; description: string; supplierReference: string | null; productId?: number; quantity: number; unitCost: number; lineTotal: number };
type RecognizedInvoice = { id: number; supplierName: string | null; invoiceNumber: string | null; invoiceDate: string | null; subtotal: number | null; vatRate: number | null; vatAmount: number | null; totalAmount: number | null; lines: RecognizedInvoiceLine[]; confidenceNote: string };
type InvoiceRecognitionResponse = { data: Omit<RecognizedInvoice, "id" | "lines"> & { lines: Array<{ description: string; supplierReference: string | null; quantity: number | null; unitCost: number | null; lineTotal: number | null }> }; draft: { id: number; lineIds: number[] } };
type CashSummary = { id: number; businessDate: string; openingFloat: string; expectedCash: string; countedCash: string | null; cardTotal: string; totalSold: string; difference: string | null; status: "open" | "closed"; denominationCounts?: Record<string, number> | null; countedCard?: string | null; notes?: string | null; businessTimezone?: string; businessDayStartsAt?: string };
type CashSessionRow = CashSummary & { openedAt: string; closedAt: string | null };
type DailyAnalysis = { businessDate: string; sessionId: number; status: "open" | "closed"; totalSold: string; cashSold: string; cardSold: string; expectedCash: string; tickets: number; hourly: Array<{ hour: number; label: string; total: string; tickets: number; cash: string; card: string }>; topProducts: Array<{ productId: number | null; productName: string; units: string; revenue: string }> };

type AdminTab = "analysis" | "overview" | "categories" | "products" | "inventory" | "suppliers" | "purchases" | "sales" | "cash" | "settings";

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function AdminScreen({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", color: "#4C8A5A", iconName: "Folder" });
  const [categoryImageUrl, setCategoryImageUrl] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({ name: "", salePrice: "", initialStock: "", categoryId: "", vatTypeId: "", vatRate: "10", barcode: "", minimumStock: "0" });
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: "", legalName: "", taxId: "", phone: "", email: "" });
  const [closeAmount, setCloseAmount] = useState("");
  const [countedCard, setCountedCard] = useState("");
  const [denominationCounts, setDenominationCounts] = useState<Record<string, string>>({});
  const [recognizedInvoice, setRecognizedInvoice] = useState<RecognizedInvoice | null>(null);
  const [manualInvoiceOpen, setManualInvoiceOpen] = useState(false);
  const [manualInvoiceNewOpen, setManualInvoiceNewOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [manualInvoiceForm, setManualInvoiceForm] = useState({ supplierId: "", invoiceNumber: "", invoiceDate: "", subtotal: "", vatAmount: "", totalAmount: "", productId: "", detectedName: "", quantity: "1", unitCost: "0", lineTotal: "0", documentUrl: "", documentName: "" });
  const [vatTypeForm, setVatTypeForm] = useState({ name: "", rate: "" });
  const [editingCashId, setEditingCashId] = useState<number | null>(null);
  const [cashEditForm, setCashEditForm] = useState({ countedCash: "", countedCard: "", notes: "" });

  const categoriesQuery = useQuery({ queryKey: ["admin-categories"], queryFn: () => api<Category[]>("/admin/categories") });
  const vatTypesQuery = useQuery({ queryKey: ["admin-vat-types"], queryFn: () => api<VatType[]>("/admin/vat-types") });
  const productsQuery = useQuery({ queryKey: ["admin-products"], queryFn: () => api<AdminProduct[]>("/admin/products") });
  const suppliersQuery = useQuery({ queryKey: ["admin-suppliers"], queryFn: () => api<Supplier[]>("/admin/suppliers") });
  const salesQuery = useQuery({ queryKey: ["admin-sales"], queryFn: () => api<SaleRow[]>("/sales?limit=100") });
  const reportQuery = useQuery({ queryKey: ["admin-sales-report"], queryFn: () => api<ReportRow[]>("/admin/reports/sales-by-product") });
  const invoicesQuery = useQuery({ queryKey: ["admin-purchase-invoices"], queryFn: () => api<PurchaseRow[]>("/admin/purchase-invoices") });
  const cashQuery = useQuery({ queryKey: ["cash"], queryFn: () => api<CashSummary>("/cash/current") });
  const analysisQuery = useQuery({ queryKey: ["daily-analysis"], queryFn: () => api<DailyAnalysis>("/admin/analysis/daily") });
  const cashHistoryQuery = useQuery({ queryKey: ["cash-history"], queryFn: () => api<CashSessionRow[]>("/admin/cash-sessions") });
  const createVatTypeMutation = useMutation({
    mutationFn: () => { const rate = Number(vatTypeForm.rate.replace(",", ".")); if (!vatTypeForm.name.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("Introduce un nombre y un porcentaje de IVA válido."); return api<{ id: number }>("/admin/vat-types", { method: "POST", body: JSON.stringify({ name: vatTypeForm.name.trim(), rate }) }); },
    onSuccess: () => { setVatTypeForm({ name: "", rate: "" }); toast.success("Tipo de IVA creado"); queryClient.invalidateQueries({ queryKey: ["admin-vat-types"] }); },
    onError: (error) => toast.error("No se ha podido crear el tipo de IVA", { description: error.message }),
  });
  const saleDetailsQuery = useQuery({ queryKey: ["sale-details", selectedSaleId], queryFn: () => api<SaleDetails>(`/sales/${selectedSaleId}`), enabled: selectedSaleId !== null });
  const updateCashMutation = useMutation({
    mutationFn: (input: { id: number; countedCash: number; countedCard: number; notes: string }) => api(`/admin/cash-sessions/${input.id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => { toast.success("Arqueo actualizado"); setEditingCashId(null); queryClient.invalidateQueries({ queryKey: ["cash-history"] }); queryClient.invalidateQueries({ queryKey: ["cash"] }); },
    onError: (error) => toast.error("No se ha podido editar el arqueo", { description: error.message }),
  });

  const invalidateAdmin = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] });
    queryClient.invalidateQueries({ queryKey: ["admin-sales"] });
    queryClient.invalidateQueries({ queryKey: ["admin-sales-report"] });
    queryClient.invalidateQueries({ queryKey: ["cash"] });
    queryClient.invalidateQueries({ queryKey: ["daily-analysis"] });
  };
  const categoryImageMutation = useMutation({
    mutationFn: async (file: File) => api<{ url: string }>("/admin/category-images", { method: "POST", body: JSON.stringify({ fileData: await fileToDataUrl(file), fileName: file.name, contentType: file.type }) }),
    onSuccess: (result) => { setCategoryImageUrl(result.url); toast.success("Imagen lista para la familia"); },
    onError: (error) => toast.error("No se ha podido subir la imagen de familia", { description: error.message }),
  });
  const createCategoryMutation = useMutation({
    mutationFn: () => api<{ id: number }>("/admin/categories", { method: "POST", body: JSON.stringify({ ...categoryForm, imageUrl: categoryImageUrl || undefined }) }),
    onSuccess: () => { toast.success("Familia creada"); setCategoryForm({ name: "", color: "#4C8A5A", iconName: "Folder" }); setCategoryImageUrl(null); setCategoryFormOpen(false); queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); queryClient.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (error) => toast.error("No se ha podido crear la familia", { description: error.message }),
  });
  const updateCategoryMutation = useMutation({
    mutationFn: () => api<{ success: boolean }>(`/admin/categories/${editingCategoryId}`, { method: "PATCH", body: JSON.stringify({ ...categoryForm, imageUrl: categoryImageUrl }) }),
    onSuccess: () => { toast.success("Familia actualizada"); setEditingCategoryId(null); setCategoryFormOpen(false); setCategoryImageUrl(null); queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); queryClient.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (error) => toast.error("No se ha podido actualizar la familia", { description: error.message }),
  });
  const reorderCategoriesMutation = useMutation({
    mutationFn: (items: Array<{ id: number; sortOrder: number }>) => api<{ success: boolean }>("/admin/categories/reorder", { method: "POST", body: JSON.stringify({ items }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); queryClient.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (error) => toast.error("No se ha podido cambiar el orden", { description: error.message }),
  });
  const deactivateCategoryMutation = useMutation({
    mutationFn: (id: number) => api<{ success: boolean }>(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) }),
    onSuccess: () => { toast.success("Familia retirada de la venta"); queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); queryClient.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (error) => toast.error("No se ha podido retirar la familia", { description: error.message }),
  });
  const createProductMutation = useMutation({
    mutationFn: () => { const salePrice = Number(productForm.salePrice.replace(",", ".")); if (!Number.isFinite(salePrice) || salePrice < 0) throw new Error("El precio de venta debe ser un número válido."); return api<{ id: number }>("/products", { method: "POST", body: JSON.stringify({ categoryId: Number(productForm.categoryId), name: productForm.name.trim(), salePrice, vatTypeId: productForm.vatTypeId ? Number(productForm.vatTypeId) : undefined, vatRate: Number(productForm.vatRate), barcode: productForm.barcode || undefined, minimumStock: Number(productForm.minimumStock || 0), initialStock: Number(productForm.initialStock || 0), imageUrl: productImageUrl || undefined }) }); },
    onSuccess: () => { setProductForm({ name: "", salePrice: "", initialStock: "", categoryId: "", vatTypeId: vatTypesQuery.data?.[0] ? String(vatTypesQuery.data[0].id) : "", vatRate: "10", barcode: "", minimumStock: "0" }); setProductImageUrl(null); setProductFormOpen(false); toast.success("Producto añadido al catálogo"); invalidateAdmin(); queryClient.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (error) => toast.error("No se ha podido crear el producto", { description: error.message }),
  });
  const updateProductMutation = useMutation({
    mutationFn: () => api<{ success: boolean }>(`/admin/products/${editingProductId}`, { method: "PATCH", body: JSON.stringify({ categoryId: Number(productForm.categoryId), name: productForm.name, salePrice: Number(productForm.salePrice), vatTypeId: productForm.vatTypeId ? Number(productForm.vatTypeId) : null, vatRate: Number(productForm.vatRate), barcode: productForm.barcode || null, minimumStock: Number(productForm.minimumStock || 0), imageUrl: productImageUrl }) }),
    onSuccess: () => { setEditingProductId(null); setProductFormOpen(false); setProductImageUrl(null); toast.success("Artículo actualizado"); invalidateAdmin(); },
    onError: (error) => toast.error("No se ha podido actualizar el artículo", { description: error.message }),
  });
  const deactivateProductMutation = useMutation({
    mutationFn: (productId: number) => api<{ success: boolean }>(`/admin/products/${productId}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Artículo retirado de la venta"); invalidateAdmin(); queryClient.invalidateQueries({ queryKey: ["catalog"] }); },
    onError: (error) => toast.error("No se ha podido retirar el artículo", { description: error.message }),
  });
  const voidInvoiceMutation = useMutation({
    mutationFn: (invoiceId: number) => api<{ success: boolean }>(`/admin/purchase-invoices/${invoiceId}/void`, { method: "POST" }),
    onSuccess: () => { toast.success("Factura anulada"); queryClient.invalidateQueries({ queryKey: ["admin-purchase-invoices"] }); },
    onError: (error) => toast.error("No se ha podido anular la factura", { description: error.message }),
  });
  const productImageMutation = useMutation({
    mutationFn: async (file: File) => api<{ url: string }>("/admin/product-images", { method: "POST", body: JSON.stringify({ fileData: await fileToDataUrl(file), fileName: file.name, contentType: file.type }) }),
    onSuccess: (result) => { setProductImageUrl(result.url); toast.success("Imagen lista para el producto"); },
    onError: (error) => toast.error("No se ha podido subir la imagen", { description: error.message }),
  });
  const saveProduct = () => { if (editingProductId) updateProductMutation.mutate(); else createProductMutation.mutate(); };
  const editProduct = (product: AdminProduct) => { setEditingProductId(product.id); setProductForm({ name: product.name, salePrice: product.salePrice, initialStock: product.stock, categoryId: String(product.categoryId), vatTypeId: product.vatTypeId ? String(product.vatTypeId) : (vatTypesQuery.data?.find((vatType) => Number(vatType.rate) === Number(product.vatRate))?.id ? String(vatTypesQuery.data.find((vatType) => Number(vatType.rate) === Number(product.vatRate))?.id) : ""), vatRate: product.vatRate, barcode: product.barcode ?? "", minimumStock: product.minimumStock }); setProductImageUrl(product.imageUrl); setProductFormOpen(true); setTab("products"); };
  const createSupplierMutation = useMutation({
    mutationFn: () => api<{ id: number }>("/admin/suppliers", { method: "POST", body: JSON.stringify({ name: supplierForm.name, legalName: supplierForm.legalName, taxId: supplierForm.taxId, phone: supplierForm.phone }) }),
    onSuccess: () => { setSupplierForm({ name: "", legalName: "", taxId: "", phone: "", email: "" }); setSupplierFormOpen(false); toast.success("Proveedor añadido"); invalidateAdmin(); },
    onError: (error) => toast.error("No se ha podido crear el proveedor", { description: error.message }),
  });
  const adjustMutation = useMutation({
    mutationFn: (input: { productId: number; newQuantity: number }) => api("/admin/inventory/adjust", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => { toast.success("Stock actualizado"); invalidateAdmin(); },
    onError: (error) => toast.error("No se ha podido actualizar el stock", { description: error.message }),
  });
  const invoiceRecognitionMutation = useMutation({
    mutationFn: async (file: File) => api<InvoiceRecognitionResponse>("/admin/purchase-invoices/recognize", { method: "POST", body: JSON.stringify({ fileData: await fileToDataUrl(file), fileName: file.name, contentType: file.type }) }),
    onSuccess: (result) => {
      const lines = result.data.lines.map((line, index) => {
        const autoMatch = productsQuery.data?.find((product) => product.name.toLowerCase() === line.description.toLowerCase());
        return { ...line, lineId: result.draft.lineIds[index], productId: autoMatch?.id, quantity: line.quantity ?? 1, unitCost: line.unitCost ?? 0, lineTotal: line.lineTotal ?? 0 };
      });
      setRecognizedInvoice({ ...result.data, id: result.draft.id, lines });
      toast.success(`Borrador de factura #${result.draft.id} creado`, { description: "Revisa las líneas antes de recibirla y sumar stock." });
      queryClient.invalidateQueries({ queryKey: ["admin-purchase-invoices"] });
    },
    onError: (error) => toast.error("No se ha podido reconocer la factura", { description: error.message }),
  });
  const receiveInvoiceMutation = useMutation({
    mutationFn: () => api<{ id: number; status: string }>(`/admin/purchase-invoices/${recognizedInvoice?.id}/receive`, { method: "POST", body: JSON.stringify({ lineMappings: recognizedInvoice?.lines.map((line) => ({ lineId: line.lineId, productId: line.productId, quantity: line.quantity, unitCost: line.unitCost, lineTotal: line.lineTotal })) }) }),
    onSuccess: () => { toast.success("Factura recibida y stock actualizado"); setRecognizedInvoice(null); invalidateAdmin(); },
    onError: (error) => toast.error("No se ha podido recibir la factura", { description: error.message }),
  });
  const manualDocumentMutation = useMutation({
    mutationFn: async (file: File) => api<{ url: string; fileName: string }>("/admin/invoice-documents", { method: "POST", body: JSON.stringify({ fileData: await fileToDataUrl(file), fileName: file.name, contentType: file.type }) }),
    onSuccess: (result) => { setManualInvoiceForm((current) => ({ ...current, documentUrl: result.url, documentName: result.fileName })); toast.success("Adjunto guardado"); },
    onError: (error) => toast.error("No se ha podido adjuntar la factura", { description: error.message }),
  });
  const manualInvoiceMutation = useMutation({
    mutationFn: () => api<{ id: number }>("/admin/purchase-invoices", { method: "POST", body: JSON.stringify({ supplierId: manualInvoiceForm.supplierId ? Number(manualInvoiceForm.supplierId) : undefined, invoiceNumber: manualInvoiceForm.invoiceNumber || undefined, invoiceDate: manualInvoiceForm.invoiceDate || undefined, subtotal: Number(manualInvoiceForm.subtotal || 0), vatAmount: Number(manualInvoiceForm.vatAmount || 0), totalAmount: Number(manualInvoiceForm.totalAmount || 0), documentUrl: manualInvoiceForm.documentUrl || undefined, documentName: manualInvoiceForm.documentName || undefined, lines: [{ productId: manualInvoiceForm.productId ? Number(manualInvoiceForm.productId) : undefined, detectedName: manualInvoiceForm.detectedName || undefined, quantity: Number(manualInvoiceForm.quantity || 1), unitCost: Number(manualInvoiceForm.unitCost || 0), vatRate: 10, lineTotal: Number(manualInvoiceForm.lineTotal || 0) }] }) }),
    onSuccess: (result) => { toast.success(`Factura manual #${result.id} guardada`); setManualInvoiceOpen(false); setManualInvoiceForm({ supplierId: "", invoiceNumber: "", invoiceDate: "", subtotal: "", vatAmount: "", totalAmount: "", productId: "", detectedName: "", quantity: "1", unitCost: "0", lineTotal: "0", documentUrl: "", documentName: "" }); queryClient.invalidateQueries({ queryKey: ["admin-purchase-invoices"] }); },
    onError: (error) => toast.error("No se ha podido guardar la factura", { description: error.message }),
  });
  const submitInvoiceDocument = (file?: File) => {
    if (!file) return;
    const supported = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!supported.includes(file.type)) {
      toast.error("Formato no admitido", { description: "Selecciona un PDF, JPG, PNG o WEBP." });
      return;
    }
    invoiceRecognitionMutation.mutate(file);
  };
  const closeMutation = useMutation({
    mutationFn: () => api<CashSummary>("/cash/close", { method: "POST", body: JSON.stringify({ countedCash: Number(closeAmount || 0), countedCard: Number(countedCard || 0), denominationCounts: Object.fromEntries(Object.entries(denominationCounts).filter(([, value]) => Number(value) > 0).map(([key, value]) => [key, Number(value)])) }) }),
    onSuccess: () => { toast.success("Caja cerrada"); setCloseAmount(""); setCountedCard(""); setDenominationCounts({}); invalidateAdmin(); },
    onError: (error) => toast.error("No se ha podido cerrar la caja", { description: error.message }),
  });

  const totalSales = salesQuery.data?.filter((sale) => sale.status === "completed").reduce((sum, sale) => sum + Number(sale.totalAmount), 0) ?? 0;
  const lowStock = productsQuery.data?.filter((product) => Number(product.stock) <= Number(product.minimumStock)) ?? [];
  const topProducts = reportQuery.data?.slice(0, 5) ?? [];

  const tabs: Array<{ id: AdminTab; label: string; icon: typeof LayoutGrid }> = [
    { id: "analysis", label: "Análisis diario", icon: LayoutGrid },
    { id: "overview", label: "Resumen", icon: LayoutGrid },
    { id: "categories", label: "Familias", icon: Folder },
    { id: "products", label: "Productos", icon: PackageOpen },
    { id: "inventory", label: "Stock", icon: ShoppingBag },
    { id: "suppliers", label: "Proveedores", icon: UtensilsCrossed },
    { id: "purchases", label: "Compras y facturas", icon: ReceiptText },
    { id: "sales", label: "Ventas", icon: Barcode },
    { id: "cash", label: "Caja", icon: Banknote },
    { id: "settings", label: "Configuración", icon: Settings },
  ];

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand"><span className="brand-mark">S/S</span><div><strong>Sweet &amp; Salty</strong><small>Administración</small></div></div>
        <nav className="admin-nav">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "admin-nav__item admin-nav__item--active" : "admin-nav__item"} onClick={() => setTab(id)}><Icon size={17} /><span>{label}</span>{id === "inventory" && lowStock.length > 0 && <b>{lowStock.length}</b>}</button>)}</nav>
        <div className="admin-sidebar__footer"><small>Versión v0.1.0 · 2026</small><button onClick={onBack}><ShoppingBag size={16} /> Volver al TPV</button></div>
      </aside>
      <section className="admin-content">
        <header className="admin-topbar"><div><span className="eyebrow">PANEL DE CONTROL</span><h1>{tabs.find((item) => item.id === tab)?.label}</h1><small className="build-label">{buildLabel}</small></div><div className="admin-topbar__actions"><span className="register-status"><i /> Caja {cashQuery.data?.status === "closed" ? "cerrada" : "abierta"}</span><button className="avatar">SS</button></div></header>
        {tab === "analysis" && <div className="admin-page analysis-page"><AdminPageHeader title="Análisis diario" description={`Jornada comercial ${analysisQuery.data?.businessDate ?? cashQuery.data?.businessDate ?? "—"} · de 07:00 a 07:00 · ${cashQuery.data?.businessTimezone ?? "Europe/Madrid"}`} /><div className="metric-grid"><div className="metric-card metric-card--accent"><span>Total vendido hoy</span><strong>{euro.format(Number(analysisQuery.data?.totalSold ?? cashQuery.data?.totalSold ?? 0))}</strong><small>{analysisQuery.data?.tickets ?? 0} tickets completados</small></div><div className="metric-card"><span>Efectivo</span><strong>{euro.format(Number(analysisQuery.data?.cashSold ?? 0))}</strong><small>Esperado en caja: {euro.format(Number(analysisQuery.data?.expectedCash ?? 0))}</small></div><div className="metric-card"><span>Tarjeta</span><strong>{euro.format(Number(analysisQuery.data?.cardSold ?? cashQuery.data?.cardTotal ?? 0))}</strong><small>Registrado en datáfono</small></div><div className="metric-card metric-card--warning"><span>Estado de caja</span><strong>{analysisQuery.data?.status === "closed" ? "Cerrada" : "Abierta"}</strong><small>Jornada activa</small></div></div><div className="admin-columns"><section className="admin-card hourly-chart-card"><div className="admin-card__header"><div><span className="eyebrow">RITMO DE VENTAS</span><h2>Ventas por hora</h2></div><span className="chart-caption">Hora española</span></div><div className="hourly-chart">{(analysisQuery.data?.hourly ?? []).map((bucket) => { const max = Math.max(...(analysisQuery.data?.hourly ?? []).map((item) => Number(item.total)), 1); const height = Math.max(4, (Number(bucket.total) / max) * 100); return <div className="hourly-chart__column" key={bucket.hour} title={`${bucket.label}: ${euro.format(Number(bucket.total))}`}><span className="hourly-chart__value">{Number(bucket.total) > 0 ? euro.format(Number(bucket.total)) : ""}</span><div className="hourly-chart__bar" style={{ height: `${height}%` }} /><small>{bucket.label}</small></div>; })}</div></section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">ARTÍCULOS</span><h2>Más vendidos hoy</h2></div></div>{(analysisQuery.data?.topProducts ?? []).length === 0 ? <div className="admin-empty">Todavía no hay ventas en esta jornada.</div> : <div className="mini-ranking">{analysisQuery.data?.topProducts.map((product, index) => <div className="mini-ranking__row" key={`${product.productId}-${product.productName}`}><b>{String(index + 1).padStart(2, "0")}</b><span>{product.productName}</span><small>{product.units} ud.</small><strong>{euro.format(Number(product.revenue))}</strong></div>)}</div>}</section></div></div>}
        {tab === "settings" && <VatSettingsPanel vatTypes={vatTypesQuery.data ?? []} form={vatTypeForm} setForm={setVatTypeForm} onCreate={() => createVatTypeMutation.mutate()} isPending={createVatTypeMutation.isPending} />}
        {tab === "overview" && <div className="admin-page"><div className="metric-grid"><div className="metric-card"><span>Ventas registradas</span><strong>{euro.format(totalSales)}</strong><small>En la consulta actual</small></div><div className="metric-card"><span>Tickets</span><strong>{salesQuery.data?.length ?? 0}</strong><small>Últimos 100 movimientos</small></div><div className="metric-card metric-card--warning"><span>Stock bajo</span><strong>{lowStock.length}</strong><small>Revisar entradas o ajustes</small></div><div className="metric-card metric-card--accent"><span>Tarjeta hoy</span><strong>{euro.format(Number(cashQuery.data?.cardTotal ?? 0))}</strong><small>Registrado en caja</small></div></div><div className="admin-columns"><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">PRODUCTOS</span><h2>Más vendidos</h2></div><button className="text-button" onClick={() => setTab("sales")}>Ver informe</button></div>{topProducts.length === 0 ? <div className="admin-empty">Aún no hay ventas de artículos.</div> : <div className="mini-ranking">{topProducts.map((product, index) => <div className="mini-ranking__row" key={`${product.productId}-${product.productName}`}><b>{String(index + 1).padStart(2, "0")}</b><span>{product.productName}</span><small>{product.units} ud.</small><strong>{euro.format(Number(product.revenue))}</strong></div>)}</div>}</section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">OPERACIÓN</span><h2>Acciones rápidas</h2></div></div><div className="quick-actions"><button onClick={() => { setTab("products"); setProductFormOpen(true); }}><Plus size={17} /><span>Añadir producto</span></button><button onClick={() => { setTab("inventory"); }}><PackageOpen size={17} /><span>Ajustar stock</span></button><button onClick={() => { setTab("purchases"); }}><ReceiptText size={17} /><span>Registrar factura</span></button><button onClick={() => { setTab("cash"); }}><Banknote size={17} /><span>Revisar caja</span></button></div></section></div><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">ACTIVIDAD</span><h2>Últimos tickets</h2></div><button className="text-button" onClick={() => setTab("sales")}>Ver todos</button></div><SalesTable sales={salesQuery.data?.slice(0, 6) ?? []} /></section></div>}
        {tab === "categories" && <CategoryManager categories={categoriesQuery.data ?? []} formOpen={categoryFormOpen} editingId={editingCategoryId} form={categoryForm} imageUrl={categoryImageUrl} isSaving={createCategoryMutation.isPending || updateCategoryMutation.isPending} imageLoading={categoryImageMutation.isPending} onOpenCreate={() => { setEditingCategoryId(null); setCategoryForm({ name: "", color: "#4C8A5A", iconName: "Folder" }); setCategoryImageUrl(null); setCategoryFormOpen(true); }} onClose={() => { setCategoryFormOpen(false); setEditingCategoryId(null); setCategoryImageUrl(null); }} onFormChange={setCategoryForm} onImage={(file) => categoryImageMutation.mutate(file)} onSave={() => { if (editingCategoryId) updateCategoryMutation.mutate(); else createCategoryMutation.mutate(); }} onEdit={(category) => { setEditingCategoryId(category.id); setCategoryForm({ name: category.name, color: category.color, iconName: category.iconName || "Folder" }); setCategoryImageUrl(category.imageUrl); setCategoryFormOpen(true); }} onMove={(category, direction) => { const current = [...(categoriesQuery.data ?? [])]; const from = current.findIndex((item) => item.id === category.id); const target = from + direction; if (target < 0 || target >= current.length) return; [current[from], current[target]] = [current[target], current[from]]; reorderCategoriesMutation.mutate(current.map((item, index) => ({ id: item.id, sortOrder: index }))); }} onDeactivate={(category) => { if (window.confirm(`¿Retirar la familia ${category.name} del TPV? Los productos deben reasignarse antes.`)) deactivateCategoryMutation.mutate(category.id); }} />}
        {tab === "products" && <div className="admin-page"><AdminPageHeader title="Catálogo de venta" description="Gestiona nombre, precio, IVA, código de barras, imagen y stock mínimo." actionLabel="Nuevo producto" onAction={() => { setEditingProductId(null); setProductImageUrl(null); setProductForm({ name: "", salePrice: "", initialStock: "", categoryId: "", vatTypeId: vatTypesQuery.data?.[0] ? String(vatTypesQuery.data[0].id) : "", vatRate: "10", barcode: "", minimumStock: "0" }); setProductFormOpen(true); }} />{productFormOpen && <div className="inline-form"><div className="form-row"><label>Nombre<input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} placeholder="Ej. Café con leche" /></label><label>Familia<select value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })}><option value="">Selecciona…</option>{categoriesQuery.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div><div className="form-row"><label>Precio de venta<input type="number" min="0" step="0.01" inputMode="decimal" value={productForm.salePrice} onChange={(event) => setProductForm({ ...productForm, salePrice: event.target.value })} placeholder="0,00" /></label><label>Tipo de IVA<select value={productForm.vatTypeId} onChange={(event) => { const selected = vatTypesQuery.data?.find((vatType) => vatType.id === Number(event.target.value)); setProductForm({ ...productForm, vatTypeId: event.target.value, vatRate: selected?.rate ?? productForm.vatRate }); }}><option value="">Selecciona un tipo…</option>{vatTypesQuery.data?.map((vatType) => <option key={vatType.id} value={vatType.id}>{vatType.name} · {vatType.rate}%</option>)}</select></label></div><div className="form-row"><label>Código de barras<input value={productForm.barcode} onChange={(event) => setProductForm({ ...productForm, barcode: event.target.value })} placeholder="Escanea o escribe" /></label><label>Stock inicial<input inputMode="decimal" value={productForm.initialStock} onChange={(event) => setProductForm({ ...productForm, initialStock: event.target.value })} placeholder="0" /></label></div><div className="form-row"><label>Stock mínimo<input inputMode="decimal" value={productForm.minimumStock} onChange={(event) => setProductForm({ ...productForm, minimumStock: event.target.value })} placeholder="0" /></label></div><label className="image-upload-field">Foto del producto <small>{productImageUrl ? "Imagen cargada" : "Opcional"}</small><input type="file" accept="image/jpeg,image/png,image/webp" disabled={productImageMutation.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) productImageMutation.mutate(file); event.currentTarget.value = ""; }} /></label><div className="inline-form__actions"><button className="secondary-button" onClick={() => setProductFormOpen(false)}>Cancelar</button><button className="primary-button" disabled={createProductMutation.isPending || updateProductMutation.isPending || !productForm.name || !productForm.categoryId || !productForm.salePrice} onClick={saveProduct}>{createProductMutation.isPending || updateProductMutation.isPending ? "Guardando…" : editingProductId ? "Guardar cambios" : "Guardar producto"}</button></div></div>}<div className="admin-card admin-table-card"><AdminProductsTable products={productsQuery.data ?? []} onEdit={editProduct} onDeactivate={(productId) => { if (window.confirm("¿Retirar este artículo de la venta? Su historial se conservará.")) deactivateProductMutation.mutate(productId); }} /></div></div>}
        {tab === "inventory" && <div className="admin-page"><AdminPageHeader title="Control de stock" description="El saldo se basa en movimientos auditables. Los ajustes requieren un motivo." /><div className="admin-card admin-table-card"><InventoryTable products={productsQuery.data ?? []} onAdjust={(productId, newQuantity) => adjustMutation.mutate({ productId, newQuantity })} /></div></div>}
        {tab === "suppliers" && <div className="admin-page"><AdminPageHeader title="Proveedores" description="Directorio independiente para compras y reconocimiento de facturas." actionLabel="Nuevo proveedor" onAction={() => setSupplierFormOpen(true)} />{supplierFormOpen && <div className="inline-form"><div className="form-row"><label>Nombre comercial<input value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} placeholder="Proveedor" /></label><label>Razón social<input value={supplierForm.legalName} onChange={(event) => setSupplierForm({ ...supplierForm, legalName: event.target.value })} placeholder="Opcional" /></label></div><div className="form-row"><label>NIF/CIF<input value={supplierForm.taxId} onChange={(event) => setSupplierForm({ ...supplierForm, taxId: event.target.value })} placeholder="Opcional" /></label><label>Teléfono<input value={supplierForm.phone} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} placeholder="Opcional" /></label></div><div className="inline-form__actions"><button className="secondary-button" onClick={() => setSupplierFormOpen(false)}>Cancelar</button><button className="primary-button" disabled={createSupplierMutation.isPending || !supplierForm.name} onClick={() => createSupplierMutation.mutate()}>{createSupplierMutation.isPending ? "Guardando…" : "Guardar proveedor"}</button></div></div>}<div className="admin-card admin-table-card"><SupplierTable suppliers={suppliersQuery.data ?? []} /></div></div>}
        {tab === "purchases" && <div className="admin-page"><AdminPageHeader title="Compras y facturas" description="Las facturas se guardarán como borradores hasta revisar el OCR y confirmar sus líneas." actionLabel="Nueva factura manual" onAction={() => setManualInvoiceNewOpen(true)} />{manualInvoiceNewOpen && <ManualInvoiceForm suppliers={suppliersQuery.data ?? []} products={productsQuery.data ?? []} onClose={() => setManualInvoiceNewOpen(false)} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["admin-purchase-invoices"] }); invalidateAdmin(); }} />}{manualInvoiceOpen && <div className="admin-card manual-invoice-card"><div className="admin-card__header"><div><span className="eyebrow">REGISTRO MANUAL</span><h2>Añadir factura</h2></div><button className="icon-button" onClick={() => setManualInvoiceOpen(false)}><X size={17} /></button></div><div className="form-row"><label>Proveedor<select value={manualInvoiceForm.supplierId} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, supplierId: event.target.value })}><option value="">Sin asignar</option>{suppliersQuery.data?.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Número de factura<input value={manualInvoiceForm.invoiceNumber} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, invoiceNumber: event.target.value })} /></label><label>Fecha<input type="date" value={manualInvoiceForm.invoiceDate} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, invoiceDate: event.target.value })} /></label></div><div className="form-row"><label>Subtotal<input inputMode="decimal" value={manualInvoiceForm.subtotal} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, subtotal: event.target.value })} /></label><label>IVA<input inputMode="decimal" value={manualInvoiceForm.vatAmount} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, vatAmount: event.target.value })} /></label><label>Total<input inputMode="decimal" value={manualInvoiceForm.totalAmount} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, totalAmount: event.target.value })} /></label></div><div className="form-row"><label>Producto TPV<select value={manualInvoiceForm.productId} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, productId: event.target.value })}><option value="">Asociar después</option>{productsQuery.data?.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>Descripción<input value={manualInvoiceForm.detectedName} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, detectedName: event.target.value })} placeholder="Descripción de la línea" /></label></div><div className="form-row"><label>Cantidad<input inputMode="decimal" value={manualInvoiceForm.quantity} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, quantity: event.target.value })} /></label><label>Coste unitario<input inputMode="decimal" value={manualInvoiceForm.unitCost} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, unitCost: event.target.value })} /></label><label>Total línea<input inputMode="decimal" value={manualInvoiceForm.lineTotal} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, lineTotal: event.target.value })} /></label></div><label className="image-upload-field">Adjuntar factura <small>{manualInvoiceForm.documentName || "PDF o imagen"}</small><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={manualDocumentMutation.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) manualDocumentMutation.mutate(file); event.currentTarget.value = ""; }} /></label><div className="inline-form__actions"><button className="secondary-button" onClick={() => setManualInvoiceOpen(false)}>Cancelar</button><button className="primary-button" disabled={manualInvoiceMutation.isPending || !manualInvoiceForm.totalAmount} onClick={() => manualInvoiceMutation.mutate()}>{manualInvoiceMutation.isPending ? "Guardando…" : "Guardar factura"}</button></div></div>}<div className="notice-card"><ReceiptText size={19} /><div><strong>Reconocimiento asistido</strong><p>Sube una factura PDF o imagen para proponer proveedor, fecha, importes y productos. Nada modifica stock sin confirmación.</p></div></div><label className={invoiceRecognitionMutation.isPending ? "invoice-dropzone invoice-dropzone--busy" : "invoice-dropzone"} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); submitInvoiceDocument(event.dataTransfer.files?.[0]); }}><Upload size={28} /><div><strong>{invoiceRecognitionMutation.isPending ? "Analizando factura…" : "Arrastra una factura aquí para registrarla"}</strong><span>Acepta PDF, JPG, PNG y WEBP. La IA propondrá proveedor, fecha, número e importe antes de que confirmes.</span></div><em>o seleccionar archivo</em><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={invoiceRecognitionMutation.isPending} onChange={(event) => { submitInvoiceDocument(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>{recognizedInvoice && <div className="admin-card recognized-invoice-card"><div className="admin-card__header"><div><span className="eyebrow">BORRADOR RECONOCIDO</span><h2>{recognizedInvoice.supplierName ?? "Proveedor no identificado"}</h2></div><span className="table-status table-status--warning">Revisión necesaria</span></div><div className="recognized-invoice-meta"><span>Nº {recognizedInvoice.invoiceNumber ?? "—"}</span><span>Fecha {recognizedInvoice.invoiceDate ?? "—"}</span><strong>{euro.format(Number(recognizedInvoice.totalAmount ?? 0))}</strong></div><p className="helper-text">{recognizedInvoice.confidenceNote}</p><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Descripción detectada</th><th>Producto TPV</th><th>Cantidad</th><th>Coste unitario</th><th>Total línea</th></tr></thead><tbody>{recognizedInvoice.lines.map((line, index) => <tr key={`${line.lineId}-${index}`}><td><strong>{line.description}</strong></td><td><select className="line-product-select" value={line.productId ?? ""} onChange={(event) => setRecognizedInvoice({ ...recognizedInvoice, lines: recognizedInvoice.lines.map((current) => current.lineId === line.lineId ? { ...current, productId: event.target.value ? Number(event.target.value) : undefined } : current) })}><option value="">Asociar…</option>{productsQuery.data?.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></td><td><input className="line-number-input" inputMode="decimal" value={line.quantity} onChange={(event) => setRecognizedInvoice({ ...recognizedInvoice, lines: recognizedInvoice.lines.map((current) => current.lineId === line.lineId ? { ...current, quantity: Number(event.target.value) || 0 } : current) })} /></td><td className="table-money"><input className="line-number-input" inputMode="decimal" value={line.unitCost} onChange={(event) => setRecognizedInvoice({ ...recognizedInvoice, lines: recognizedInvoice.lines.map((current) => current.lineId === line.lineId ? { ...current, unitCost: Number(event.target.value) || 0 } : current) })} /></td><td className="table-money"><input className="line-number-input" inputMode="decimal" value={line.lineTotal} onChange={(event) => setRecognizedInvoice({ ...recognizedInvoice, lines: recognizedInvoice.lines.map((current) => current.lineId === line.lineId ? { ...current, lineTotal: Number(event.target.value) || 0 } : current) })} /></td></tr>)}</tbody></table></div><div className="recognized-invoice-actions"><span>{recognizedInvoice.lines.filter((line) => line.productId).length} de {recognizedInvoice.lines.length} líneas asociadas</span><button className="primary-button" disabled={receiveInvoiceMutation.isPending || recognizedInvoice.lines.some((line) => !line.productId || line.quantity <= 0)} onClick={() => receiveInvoiceMutation.mutate()}>{receiveInvoiceMutation.isPending ? "Actualizando…" : "Confirmar entrada y sumar stock"}</button></div></div>}<div className="admin-card admin-table-card"><PurchaseTable invoices={invoicesQuery.data ?? []} onVoid={(invoiceId) => { if (window.confirm("¿Anular esta factura en borrador? No se modificará el stock.")) voidInvoiceMutation.mutate(invoiceId); }} /></div></div>}
        {tab === "sales" && <div className="admin-page"><AdminPageHeader title="Ventas e históricos" description="Consulta tickets, métodos de pago y rendimiento por artículo." /><div className="admin-card admin-table-card"><SalesTable sales={salesQuery.data ?? []} onView={setSelectedSaleId} />{selectedSaleId !== null && saleDetailsQuery.data && <div className="ticket-detail-card"><div className="admin-card__header"><div><span className="eyebrow">TICKET {saleDetailsQuery.data.saleNumber}</span><h2>Detalle de venta</h2></div><div className="ticket-detail-actions"><button className="secondary-button secondary-button--small" onClick={() => printSaleReceipt(saleDetailsQuery.data)}><Printer size={15} /> Imprimir ticket</button><button className="icon-button" onClick={() => setSelectedSaleId(null)}><X size={17} /></button></div></div><div className="ticket-detail-lines">{saleDetailsQuery.data.lines.map((line) => <div key={line.id}><span>{line.productName} × {line.quantity}</span><strong>{euro.format(Number(line.lineTotal))}</strong></div>)}</div><div className="ticket-detail-summary"><span>IVA incluido: {euro.format(Number(saleDetailsQuery.data.vatAmount))}</span><strong>{euro.format(Number(saleDetailsQuery.data.totalAmount))}</strong><span>{saleDetailsQuery.data.payment?.method === "card" ? "Pago con tarjeta" : "Pago en efectivo"}</span></div></div>}</div><div className="admin-card admin-table-card"><div className="admin-card__header"><div><span className="eyebrow">RENDIMIENTO</span><h2>Ventas por artículo</h2></div></div><ReportTable report={reportQuery.data ?? []} /></div></div>}
        {tab === "cash" && <div className="admin-page"><AdminPageHeader title="Caja diaria" description="Una única caja, con jornada comercial de 07:00 a 07:00 y hora española." /><div className="cash-detail-grid"><div className="metric-card"><span>Fecha de negocio</span><strong>{cashQuery.data?.businessDate ?? "—"}</strong><small>07:00–07:00 · {cashQuery.data?.businessTimezone ?? "Europe/Madrid"}</small></div><div className="metric-card"><span>Total vendido</span><strong>{euro.format(Number(cashQuery.data?.totalSold ?? 0))}</strong><small>Ventas completadas de la jornada</small></div><div className="metric-card metric-card--accent"><span>Efectivo esperado</span><strong>{euro.format(Number(cashQuery.data?.expectedCash ?? 0))}</strong><small>Ventas en efectivo + fondo</small></div><div className="metric-card"><span>Tarjeta</span><strong>{euro.format(Number(cashQuery.data?.cardTotal ?? 0))}</strong><small>Confirmado en el datáfono</small></div></div><div className="admin-card cash-close-card"><div><span className="eyebrow">ARQUEO</span><h2>{cashQuery.data?.status === "closed" ? "Caja cerrada" : "Cerrar caja del día"}</h2><p>Introduce el número de monedas y billetes. El importe de efectivo se calcula automáticamente; registra también el total comprobado del datáfono.</p></div>{cashQuery.data?.status === "open" && <div className="cash-count-grid">{["0.10","0.20","0.50","1.00","2.00","5.00","10.00","20.00","50.00"].map((denomination) => { const count = Number(denominationCounts[denomination] ?? 0); const amount = count * Number(denomination); return <label key={denomination}><span>{Number(denomination).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €</span><input inputMode="numeric" min="0" type="number" value={denominationCounts[denomination] ?? ""} onChange={(event) => { const next = { ...denominationCounts, [denomination]: event.target.value }; setDenominationCounts(next); const calculated = Object.entries(next).reduce((sum, [key, value]) => sum + Number(key) * (Number(value) || 0), 0); setCloseAmount(calculated > 0 ? calculated.toFixed(2) : ""); }} placeholder="0" /><small>{euro.format(amount)}</small></label>; })}<label className="cash-count-total"><span>Efectivo contado</span><input inputMode="decimal" value={closeAmount} onChange={(event) => { setCloseAmount(event.target.value); setDenominationCounts({}); }} placeholder="Se calcula con denominaciones" /><small>Alternativa manual</small></label><label className="cash-count-total"><span>Tarjetas contadas</span><input inputMode="decimal" value={countedCard} onChange={(event) => setCountedCard(event.target.value)} placeholder={cashQuery.data?.cardTotal ?? "0,00"} /><small>Esperado: {euro.format(Number(cashQuery.data?.cardTotal ?? 0))}</small></label><button className="primary-button cash-close-submit" disabled={closeMutation.isPending || (!closeAmount && Object.values(denominationCounts).every((value) => !Number(value)))} onClick={() => closeMutation.mutate()}>Cerrar caja y guardar arqueo</button></div>}{cashQuery.data?.status === "closed" && <div className="closed-badge"><Banknote size={17} /> Cerrada correctamente</div>}</div><CashHistoryTable sessions={cashHistoryQuery.data ?? []} editingId={editingCashId} editForm={cashEditForm} setEditingId={setEditingCashId} setEditForm={setCashEditForm} onSave={(session) => updateCashMutation.mutate({ id: session.id, countedCash: Number(cashEditForm.countedCash) || 0, countedCard: Number(cashEditForm.countedCard) || 0, notes: cashEditForm.notes })} /></div>}
      </section>
    </main>
  );
}

function AdminPageHeader({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="admin-page-header"><div><h2>{title}</h2><p>{description}</p></div>{actionLabel && onAction && <button className="primary-button" onClick={onAction}><Plus size={16} /> {actionLabel}</button>}</div>;
}

function AdminProductsTable({ products, onEdit, onDeactivate }: { products: AdminProduct[]; onEdit: (product: AdminProduct) => void; onDeactivate: (productId: number) => void }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Artículo</th><th>Familia</th><th>Precio</th><th>IVA</th><th>Código</th><th>Coste medio</th><th>Stock</th><th>Acción</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><div className="table-product"><ProductImage product={product} compact /><strong>{product.name}</strong></div></td><td>{product.categoryName}</td><td className="table-money">{euro.format(Number(product.salePrice))}</td><td>{product.vatRate}%</td><td>{product.barcode ?? "—"}</td><td className="table-money">{euro.format(Number(product.weightedAverageCost))}</td><td><span className={Number(product.stock) <= Number(product.minimumStock) ? "table-status table-status--warning" : "table-status"}>{product.stock}</span></td><td><div className="table-actions"><button className="table-icon-button" onClick={() => onEdit(product)} title="Editar artículo"><Settings size={15} /></button><button className="table-icon-button table-icon-button--danger" onClick={() => onDeactivate(product.id)} title="Retirar artículo"><Trash2 size={15} /></button></div></td></tr>)}</tbody></table>{products.length === 0 && <div className="admin-empty">No hay productos. Añade el primero desde el botón superior.</div>}</div>;
}

function InventoryTable({ products, onAdjust }: { products: AdminProduct[]; onAdjust: (productId: number, quantity: number) => void }) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Artículo</th><th>Stock actual</th><th>Mínimo</th><th>Acción</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small className="table-subtext">{product.categoryName}</small></td><td><span className={Number(product.stock) <= Number(product.minimumStock) ? "table-status table-status--warning" : "table-status"}>{product.stock} {product.unit}</span></td><td>{product.minimumStock}</td><td><div className="table-edit"><input inputMode="decimal" value={drafts[product.id] ?? product.stock} onChange={(event) => setDrafts({ ...drafts, [product.id]: event.target.value })} /><button className="secondary-button secondary-button--small" onClick={() => onAdjust(product.id, Number(drafts[product.id]))}>Guardar</button></div></td></tr>)}</tbody></table>{products.length === 0 && <div className="admin-empty">No hay artículos para controlar.</div>}</div>;
}

function SupplierTable({ suppliers }: { suppliers: Supplier[] }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Proveedor</th><th>Razón social</th><th>NIF/CIF</th><th>Contacto</th></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.id}><td><strong>{supplier.name}</strong></td><td>{supplier.legalName ?? "—"}</td><td>{supplier.taxId ?? "—"}</td><td>{supplier.phone ?? supplier.email ?? "—"}</td></tr>)}</tbody></table>{suppliers.length === 0 && <div className="admin-empty">Aún no hay proveedores.</div>}</div>;
}

function SalesTable({ sales, onView }: { sales: SaleRow[]; onView?: (saleId: number) => void }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Ticket</th><th>Fecha y hora</th><th>Método</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td><strong>{sale.saleNumber}</strong></td><td>{new Date(sale.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</td><td><span className="payment-pill">{sale.method === "card" ? <CreditCard size={13} /> : <Banknote size={13} />} {sale.method === "card" ? "Tarjeta" : "Efectivo"}</span></td><td className="table-money">{euro.format(Number(sale.totalAmount))}</td><td><span className="table-status table-status--success">{sale.status === "completed" ? "Completado" : sale.status}</span></td><td>{onView && <button className="secondary-button secondary-button--small" onClick={() => onView(sale.id)}><ReceiptText size={14} /> Ver ticket</button>}</td></tr>)}</tbody></table>{sales.length === 0 && <div className="admin-empty">No hay ventas registradas todavía.</div>}</div>;
}

function ReportTable({ report }: { report: ReportRow[] }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Artículo</th><th>Unidades</th><th>Ingresos</th><th>Coste</th><th>Margen bruto</th></tr></thead><tbody>{report.map((row) => <tr key={`${row.productId}-${row.productName}`}><td><strong>{row.productName}</strong></td><td>{row.units}</td><td className="table-money">{euro.format(Number(row.revenue))}</td><td className="table-money">{euro.format(Number(row.cost))}</td><td className="table-money table-money--positive">{euro.format(Number(row.margin))}</td></tr>)}</tbody></table>{report.length === 0 && <div className="admin-empty">El informe aparecerá al registrar ventas.</div>}</div>;
}

function PurchaseTable({ invoices, onVoid }: { invoices: PurchaseRow[]; onVoid: (invoiceId: number) => void }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Factura</th><th>Proveedor</th><th>Fecha</th><th>Total</th><th>OCR</th><th>Estado</th><th></th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoiceNumber ?? `Borrador #${invoice.id}`}</strong></td><td>{invoice.supplierName ?? "Sin asignar"}</td><td>{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString("es-ES") : "—"}</td><td className="table-money">{euro.format(Number(invoice.totalAmount))}</td><td><span className={invoice.ocrStatus === "ready" || invoice.ocrStatus === "reviewed" ? "table-status table-status--success" : "table-status table-status--warning"}>{invoice.ocrStatus}</span></td><td>{invoice.status}</td><td>{invoice.status === "draft" && <button className="secondary-button secondary-button--small" onClick={() => onVoid(invoice.id)}><Trash2 size={14} /> Anular</button>}</td></tr>)}</tbody></table>{invoices.length === 0 && <div className="admin-empty">No hay facturas de compra. Puedes registrar la primera cuando esté disponible el cargador.</div>}</div>;
}

type DeferredInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function App() {
  const [view, setView] = useState<"pos" | "admin">("pos");
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [installed, setInstalled] = useState(window.matchMedia?.("(display-mode: standalone)").matches ?? false);
  useEffect(() => {
    const onBeforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as DeferredInstallPrompt); };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); toast.success("Sweet & Salty se ha instalado en la tablet"); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onBeforeInstall); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  return (
    <>
      <Toaster position="top-center" richColors />
      {view === "pos" ? <PosScreen /> : <AdminScreen onBack={() => setView("pos")} />}
      {!installed && installPrompt && <button className="pwa-install-button" onClick={async () => { await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === "accepted") setInstallPrompt(null); }}><Smartphone size={18} /> Instalar en tablet</button>}
      <button className="admin-launcher" onClick={() => setView((current) => current === "pos" ? "admin" : "pos")} title={view === "pos" ? "Abrir administración" : "Volver al TPV"}>{view === "pos" ? <LayoutGrid size={19} /> : <ShoppingBag size={19} />}</button>
    </>
  );
}

export default App;


function ManualInvoiceForm({ suppliers, products, onClose, onSaved }: { suppliers: Supplier[]; products: AdminProduct[]; onClose: () => void; onSaved: () => void }) {
  const [header, setHeader] = useState({ supplierId: "", invoiceNumber: "", invoiceDate: new Date().toISOString().slice(0, 10), notes: "", documentUrl: "", documentName: "" });
  const [lines, setLines] = useState<Array<{ productId: string; description: string; quantity: string; unitCost: string; vatRate: string }>>([{ productId: "", description: "", quantity: "1", unitCost: "", vatRate: "10" }]);
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => api<{ url: string; fileName: string }>("/admin/invoice-documents", { method: "POST", body: JSON.stringify({ fileData: await fileToDataUrl(file), fileName: file.name, contentType: file.type }) }),
    onSuccess: (result) => { setHeader((current) => ({ ...current, documentUrl: result.url, documentName: result.fileName })); toast.success("Documento adjuntado"); },
    onError: (error) => toast.error("No se ha podido adjuntar el documento", { description: error.message }),
  });
  const saveMutation = useMutation({
    mutationFn: () => {
      const preparedLines = lines.map((line) => {
        const quantityValue = Number(line.quantity) || 0;
        const unitCostValue = Number(line.unitCost) || 0;
        return { productId: line.productId ? Number(line.productId) : undefined, detectedName: line.description.trim() || undefined, quantity: quantityValue, unitCost: unitCostValue, vatRate: Number(line.vatRate) || 0, lineTotal: quantityValue * unitCostValue };
      });
      const subtotal = preparedLines.reduce((sum, line) => sum + line.lineTotal, 0);
      const vatAmount = preparedLines.reduce((sum, line) => sum + line.lineTotal * (line.vatRate / 100), 0);
      return api<{ id: number }>("/admin/purchase-invoices", { method: "POST", body: JSON.stringify({ supplierId: header.supplierId ? Number(header.supplierId) : undefined, invoiceNumber: header.invoiceNumber.trim() || undefined, invoiceDate: header.invoiceDate || undefined, subtotal, vatAmount, totalAmount: subtotal + vatAmount, documentUrl: header.documentUrl || undefined, documentName: header.documentName || undefined, notes: header.notes.trim() || undefined, lines: preparedLines }) });
    },
    onSuccess: (result) => { toast.success(`Factura #${result.id} guardada como borrador`); onSaved(); onClose(); },
    onError: (error) => toast.error("No se ha podido guardar la factura", { description: error.message }),
  });
  const updateLine = (index: number, patch: Partial<(typeof lines)[number]>) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0) * (1 + (Number(line.vatRate) || 0) / 100), 0);
  const canSave = lines.length > 0 && lines.every((line) => Number(line.quantity) > 0 && Number(line.unitCost) >= 0) && total > 0;
  return <section className="manual-invoice-card manual-invoice-card--new"><div className="manual-invoice-card__header"><div><span className="eyebrow">COMPRA · REGISTRO MANUAL</span><h2>Nueva factura de proveedor</h2><p>Introduce los datos y líneas de la factura. Se guardará como borrador y no sumará stock hasta confirmar la recepción.</p></div><button className="icon-button" onClick={onClose} aria-label="Cerrar formulario"><X size={17} /></button></div><div className="manual-invoice-section"><h3>1. Datos de la factura</h3><div className="manual-invoice-grid manual-invoice-grid--three"><label>Proveedor<select value={header.supplierId} onChange={(event) => setHeader({ ...header, supplierId: event.target.value })}><option value="">Sin asignar</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Número de factura<input value={header.invoiceNumber} onChange={(event) => setHeader({ ...header, invoiceNumber: event.target.value })} placeholder="Ej. F-2026-0048" /></label><label>Fecha<input type="date" value={header.invoiceDate} onChange={(event) => setHeader({ ...header, invoiceDate: event.target.value })} /></label></div></div><div className="manual-invoice-section"><div className="manual-invoice-section__title"><div><h3>2. Líneas de compra</h3><p>Asocia cada línea a un artículo para poder recibirla y actualizar el coste medio.</p></div><button className="secondary-button secondary-button--small" onClick={() => setLines([...lines, { productId: "", description: "", quantity: "1", unitCost: "", vatRate: "10" }])}><Plus size={14} /> Añadir línea</button></div><div className="manual-line-list"><div className="manual-line-list__head"><span>Artículo / descripción</span><span>Cantidad</span><span>Coste unitario</span><span>IVA</span><span>Importe</span><span></span></div>{lines.map((line, index) => { const amount = (Number(line.quantity) || 0) * (Number(line.unitCost) || 0); return <div className="manual-line" key={index}><label><select value={line.productId} onChange={(event) => updateLine(index, { productId: event.target.value })}><option value="">Asociar después</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><input value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} placeholder="Descripción de la línea" /></label><input inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /><input inputMode="decimal" value={line.unitCost} onChange={(event) => updateLine(index, { unitCost: event.target.value })} placeholder="0,00" /><select value={line.vatRate} onChange={(event) => updateLine(index, { vatRate: event.target.value })}><option value="0">0%</option><option value="4">4%</option><option value="10">10%</option><option value="21">21%</option></select><strong>{euro.format(amount)}</strong><button className="table-icon-button table-icon-button--danger" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))} aria-label="Eliminar línea"><Trash2 size={14} /></button></div>; })}</div></div><div className="manual-invoice-section manual-invoice-summary"><div><label>Notas<input value={header.notes} onChange={(event) => setHeader({ ...header, notes: event.target.value })} placeholder="Opcional" /></label><label className="manual-document-input">Adjunto <small>{header.documentName || "Ningún documento"}</small><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={uploadMutation.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadMutation.mutate(file); event.currentTarget.value = ""; }} /></label></div><div className="manual-invoice-totals"><span>Base imponible <strong>{euro.format(lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0))}</strong></span><span>IVA <strong>{euro.format(lines.reduce((sum, line) => { const amount = (Number(line.quantity) || 0) * (Number(line.unitCost) || 0); return sum + amount * ((Number(line.vatRate) || 0) / 100); }, 0))}</strong></span><b>Total factura <strong>{euro.format(total)}</strong></b></div></div><footer className="manual-invoice-actions"><span>{header.documentName ? "Documento adjunto" : "Adjuntar factura es opcional"}</span><div><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!canSave || saveMutation.isPending || uploadMutation.isPending} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? "Guardando…" : "Guardar borrador"}</button></div></footer></section>;
}


function VatSettingsPanel({ vatTypes, form, setForm, onCreate, isPending }: { vatTypes: VatType[]; form: { name: string; rate: string }; setForm: (value: { name: string; rate: string }) => void; onCreate: () => void; isPending: boolean }) {
  return <div className="admin-page"><AdminPageHeader title="Configuración de IVA" description="Crea y administra los tipos de IVA disponibles. Los artículos seleccionan un tipo de esta lista." /><div className="admin-columns"><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">NUEVO TIPO</span><h2>Añadir tipo de IVA</h2></div></div><div className="vat-form"><label>Nombre<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. IVA reducido" /></label><label>Porcentaje<input type="number" min="0" max="100" step="0.01" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} placeholder="10" /></label><button className="primary-button" disabled={isPending || !form.name || !form.rate} onClick={onCreate}><Plus size={15} /> Guardar tipo</button></div></section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">TIPOS DISPONIBLES</span><h2>Tipos de IVA configurados</h2></div></div><div className="vat-list">{vatTypes.map((vatType) => <div className="vat-list__row" key={vatType.id}><div><strong>{vatType.name}</strong><small>Aplicable a nuevos artículos y productos editados</small></div><b>{Number(vatType.rate).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%</b></div>)}</div>{vatTypes.length === 0 && <div className="admin-empty">Todavía no hay tipos configurados.</div>}</section></div></div>;
}


function CashHistoryTable({ sessions, editingId, editForm, setEditingId, setEditForm, onSave }: { sessions: CashSessionRow[]; editingId: number | null; editForm: { countedCash: string; countedCard: string; notes: string }; setEditingId: (id: number | null) => void; setEditForm: (value: { countedCash: string; countedCard: string; notes: string }) => void; onSave: (session: CashSessionRow) => void }) {
  return <section className="admin-card cash-history-card"><div className="admin-card__header"><div><span className="eyebrow">HISTÓRICO</span><h2>Cajas cerradas y arqueos</h2><p className="admin-card__description">Consulta jornadas anteriores y corrige el efectivo o la tarjeta contada cuando sea necesario.</p></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Jornada</th><th>Ventas</th><th>Efectivo esperado</th><th>Efectivo contado</th><th>Tarjeta</th><th>Descuadre</th><th>Estado</th><th></th></tr></thead><tbody>{sessions.map((session) => editingId === session.id ? <tr key={session.id}><td><strong>{session.businessDate}</strong><small className="table-subtext">Cierre {session.closedAt ? new Date(session.closedAt).toLocaleString("es-ES") : "—"}</small></td><td className="table-money">{euro.format(Number(session.totalSold))}</td><td className="table-money">{euro.format(Number(session.expectedCash))}</td><td><input className="history-edit-input" type="number" min="0" step="0.01" value={editForm.countedCash} onChange={(event) => setEditForm({ ...editForm, countedCash: event.target.value })} /></td><td><input className="history-edit-input" type="number" min="0" step="0.01" value={editForm.countedCard} onChange={(event) => setEditForm({ ...editForm, countedCard: event.target.value })} /></td><td>—</td><td><span className="table-status table-status--success">Cerrada</span></td><td><div className="table-actions"><button className="secondary-button secondary-button--small" onClick={() => onSave(session)}>Guardar</button><button className="table-icon-button" onClick={() => setEditingId(null)}><X size={14} /></button></div></td></tr> : <tr key={session.id}><td><strong>{session.businessDate}</strong><small className="table-subtext">Cierre {session.closedAt ? new Date(session.closedAt).toLocaleString("es-ES") : "—"}</small></td><td className="table-money">{euro.format(Number(session.totalSold))}</td><td className="table-money">{euro.format(Number(session.expectedCash))}</td><td className="table-money">{session.countedCash === null ? "—" : euro.format(Number(session.countedCash))}</td><td className="table-money">{euro.format(Number(session.countedCard ?? session.cardTotal))}</td><td className={Number(session.difference) === 0 ? "table-money" : "table-money table-money--negative"}>{session.difference === null ? "—" : euro.format(Number(session.difference))}</td><td><span className={session.status === "closed" ? "table-status table-status--success" : "table-status table-status--warning"}>{session.status === "closed" ? "Cerrada" : "Abierta"}</span></td><td>{session.status === "closed" && <button className="secondary-button secondary-button--small" onClick={() => { setEditingId(session.id); setEditForm({ countedCash: session.countedCash ?? "", countedCard: session.countedCard ?? session.cardTotal, notes: session.notes ?? "" }); }}>Editar arqueo</button>}</td></tr>)}</tbody></table></div>{sessions.length === 0 && <div className="admin-empty">Todavía no hay cajas cerradas.</div>}</section>;
}


function CategoryManager({ categories, formOpen, editingId, form, imageUrl, isSaving, imageLoading, onOpenCreate, onClose, onFormChange, onImage, onSave, onEdit, onMove, onDeactivate }: { categories: Category[]; formOpen: boolean; editingId: number | null; form: { name: string; color: string; iconName: string }; imageUrl: string | null; isSaving: boolean; imageLoading: boolean; onOpenCreate: () => void; onClose: () => void; onFormChange: (value: { name: string; color: string; iconName: string }) => void; onImage: (file: File) => void; onSave: () => void; onEdit: (category: Category) => void; onMove: (category: Category, direction: -1 | 1) => void; onDeactivate: (category: Category) => void }) {
  const iconOptions = [{ value: "Folder", label: "Carpeta" }, { value: "Coffee", label: "Café" }, { value: "UtensilsCrossed", label: "Comida" }, { value: "ShoppingBag", label: "Bolsa" }, { value: "GlassWater", label: "Bebida" }];
  const colors = ["#4C8A5A", "#875A3B", "#DD7B47", "#708E59", "#5680A5", "#775E93", "#B06771", "#5C7D84"];
  return <div className="admin-page"><AdminPageHeader title="Familias del menú" description="Crea las secciones que aparecen en la venta rápida y decide su orden, color, icono o fotografía." actionLabel="Nueva familia" onAction={onOpenCreate} />{formOpen && <section className="admin-card category-form-card"><div className="admin-card__header"><div><span className="eyebrow">{editingId ? "EDITAR FAMILIA" : "NUEVA FAMILIA"}</span><h2>{editingId ? "Personalizar familia" : "Crear una familia de productos"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar formulario"><X size={17} /></button></div><div className="category-form-grid"><label>Nombre<input value={form.name} onChange={(event) => onFormChange({ ...form, name: event.target.value })} placeholder="Ej. Helados" /></label><label>Icono<select value={form.iconName} onChange={(event) => onFormChange({ ...form, iconName: event.target.value })}>{iconOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><div className="category-color-picker"><span>Color del recuadro</span><div>{colors.map((color) => <button key={color} type="button" className={form.color === color ? "category-color-dot category-color-dot--selected" : "category-color-dot"} style={{ background: color }} onClick={() => onFormChange({ ...form, color })} aria-label={`Usar ${color}`} />)}<input type="color" value={form.color} onChange={(event) => onFormChange({ ...form, color: event.target.value })} aria-label="Color personalizado" /></div></div><label className="image-upload-field">Foto de la familia <small>{imageUrl ? "Imagen cargada" : "Opcional: se mostrará a pantalla completa"}</small><input type="file" accept="image/jpeg,image/png,image/webp" disabled={imageLoading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onImage(file); event.currentTarget.value = ""; }} /></label></div><div className="category-form-preview" style={{ "--family-color": form.color } as React.CSSProperties}><div>{imageUrl ? <img src={imageUrl} alt="Vista previa de familia" /> : <CategoryVisual category={{ id: 0, name: form.name || "Familia", color: form.color, imageUrl: null, iconName: form.iconName, sortOrder: 0, isFeatured: false }} />}</div><span>{form.name || "Nombre de familia"}</span></div><div className="inline-form__actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={isSaving || !form.name.trim()} onClick={onSave}>{isSaving ? "Guardando…" : editingId ? "Guardar familia" : "Crear familia"}</button></div></section>}<section className="admin-card category-list-card"><div className="admin-card__header"><div><span className="eyebrow">ORDEN DEL TPV</span><h2>Familias publicadas</h2><p className="admin-card__description">Usa las flechas para reorganizar cómo aparecen en la primera pantalla del TPV.</p></div></div><div className="category-admin-list">{categories.map((category, index) => <article className={category.isActive === false ? "category-admin-row category-admin-row--inactive" : "category-admin-row"} key={category.id}><div className="category-admin-row__order"><GripVertical size={17} /><b>{String(index + 1).padStart(2, "0")}</b></div><div className="category-admin-row__preview" style={{ background: category.color }}>{category.imageUrl ? <img src={category.imageUrl} alt="" /> : <CategoryVisual category={category} compact />}</div><div className="category-admin-row__name"><strong>{category.name}</strong><small>{category.imageUrl ? "Imagen" : `Icono: ${category.iconName}`} · {category.isActive === false ? "Oculta" : "Visible en TPV"}</small></div><div className="category-admin-row__actions"><button className="table-icon-button" disabled={index === 0} onClick={() => onMove(category, -1)} title="Subir">↑</button><button className="table-icon-button" disabled={index === categories.length - 1} onClick={() => onMove(category, 1)} title="Bajar">↓</button><button className="table-icon-button" onClick={() => onEdit(category)} title="Editar"><Pencil size={15} /></button>{category.isActive !== false && <button className="table-icon-button table-icon-button--danger" onClick={() => onDeactivate(category)} title="Retirar familia"><Power size={15} /></button>}</div></article>)}</div>{categories.length === 0 && <div className="admin-empty">Todavía no hay familias. Crea la primera para organizar el menú.</div>}</section></div>;
}


function printSaleReceipt(sale: SaleDetails) {
  const printWindow = window.open("", "sweet-salty-receipt", "width=420,height=720");
  if (!printWindow) { toast.error("El navegador ha bloqueado la impresión", { description: "Permite ventanas emergentes para imprimir tickets." }); return; }
  const escape = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] ?? character));
  const lines = sale.lines.map((line) => `<tr><td>${escape(line.productName)}<br><small>${escape(line.quantity)} × ${euro.format(Number(line.unitPrice))}</small></td><td>${euro.format(Number(line.lineTotal))}</td></tr>`).join("");
  const date = new Date(sale.createdAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket ${escape(sale.saleNumber)}</title><style>@page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{width:72mm;margin:0;color:#111;font:12px Arial,sans-serif}h1,h2,p{margin:0;text-align:center}h1{font-size:20px;margin-bottom:4px}h2{font-size:12px;font-weight:400;margin-bottom:14px}.meta{border-top:1px dashed #111;border-bottom:1px dashed #111;padding:7px 0;margin-bottom:9px;font-size:10px}table{width:100%;border-collapse:collapse}td{padding:4px 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}small{font-size:10px}.total{display:flex;justify-content:space-between;border-top:1px dashed #111;margin-top:8px;padding-top:8px;font-size:16px;font-weight:700}.foot{margin-top:14px;font-size:10px}@media print{body{width:72mm}}</style></head><body><h1>Sweet &amp; Salty</h1><h2>Ticket de venta</h2><div class="meta">${escape(sale.saleNumber)}<br>${escape(date)}<br>${sale.payment?.method === "card" ? "Pago con tarjeta" : "Pago en efectivo"}</div><table>${lines}</table><div class="total"><span>TOTAL</span><span>${euro.format(Number(sale.totalAmount))}</span></div><p class="foot">IVA incluido: ${euro.format(Number(sale.vatAmount))}<br>Gracias por tu visita</p><script>window.onload=()=>{window.focus();window.print();};<\/script></body></html>`);
  printWindow.document.close();
}
