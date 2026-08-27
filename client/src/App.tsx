import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  Barcode,
  BarChart3,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  Image,
  Link2,
  RefreshCw,
  Store,
  Check,
  Coffee,
  CreditCard,
  Folder,
  GlassWater,
  GripVertical,
  ImagePlus,
  LayoutGrid,
  Mail,
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
  UsersRound,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import QRCode from "qrcode";

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const buildLabel = import.meta.env.VITE_BUILD_LABEL ?? "Versión v0.1.0 · 13/08/2026 16:50";
const SALES_CHUNK_DAYS = 14;
const SALES_HISTORY_MAX_DAYS = 31;

function buildSalesRanges(from: string, to: string) {
  const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
  const start = from ? new Date(`${from}T00:00:00.000`) : new Date(end.getTime() - (SALES_HISTORY_MAX_DAYS - 1) * 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) throw new Error("El periodo de ventas no es válido.");
  const ranges: Array<{ from: string; to: string }> = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const chunkEnd = new Date(Math.min(end.getTime(), cursor.getTime() + (SALES_CHUNK_DAYS - 1) * 24 * 60 * 60 * 1000 + (24 * 60 * 60 * 1000 - 1)));
    ranges.push({ from: cursor.toISOString(), to: chunkEnd.toISOString() });
    cursor = new Date(chunkEnd.getTime() + 1);
  }
  return ranges;
}

async function syncSalesLast31Days(storeId = "") {
  const end = new Date();
  const start = new Date(end.getTime() - (SALES_HISTORY_MAX_DAYS - 1) * 24 * 60 * 60 * 1000);
  const ranges = buildSalesRanges(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  let receipts = 0;
  let shifts = 0;
  for (const range of ranges) {
    const result = await api<{ receipts: number; shifts: number }>("/admin/loyverse/sync/sales", { method: "POST", body: JSON.stringify({ ...range, storeId: storeId || undefined }) });
    receipts += result.receipts;
    shifts += result.shifts;
  }
  return { receipts, shifts, chunks: ranges.length, noData: false };
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "No se pudo completar la operación.");
  return body as T;
}

type Category = { id: number; name: string; parentCategoryId: number | null; color: string; imageUrl: string | null; iconName: string; sortOrder: number; isFeatured: boolean; isPromotion?: boolean; isActive?: boolean };
type VatType = { id: number; name: string; rate: string; sortOrder: number; isActive: boolean };
type Product = {
  id: number;
  categoryId: number;
  categoryName: string;
  categoryIsPromotion?: boolean;
  promotionId?: number | null;
  vatTypeId: number | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  imageUrl: string | null;
  imageZoom?: string | number;
  imagePositionX?: string | number;
  imagePositionY?: string | number;
  unit: string;
  salePrice: string;
  vatRate: string;
  cost?: string;
  stock: string;
  isFeatured?: boolean;
  showInTpv?: boolean;
};
type CartLine = Product & { quantity: number; unitPriceOverride?: number; discountPercent?: number; pricingMode?: "normal" | "discount" | "cost" | "free" | "promotion"; promotionId?: number | null; promotionSelections?: number[]; promotionComponents?: string[] };
type OpenTicket = { slotNumber: number; cart: CartLine[] | string | unknown; savedAt: string };

function normalizeOpenTicketCart(value: OpenTicket["cart"]): CartLine[] {
  if (Array.isArray(value)) return value as CartLine[];
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as CartLine[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function cartLineBasePrice(line: CartLine) { return line.pricingMode === "cost" ? Number(line.cost ?? 0) : Number(line.unitPriceOverride ?? line.salePrice); }
function cartLineDiscount(line: CartLine) { return line.pricingMode === "free" ? 100 : Number(line.discountPercent ?? 0); }
function cartLineUnitPrice(line: CartLine) { return Math.max(0, cartLineBasePrice(line) * (1 - cartLineDiscount(line) / 100)); }
function cartLineTotal(line: CartLine) { return cartLineUnitPrice(line) * line.quantity; }
function cartLineVat(line: CartLine) { const rate = Number(line.vatRate); const total = cartLineTotal(line); return total * rate / (100 + rate); }
function cartLineIdentity(line: CartLine) { return `${line.id}:${line.promotionId ?? "normal"}:${(line.promotionSelections ?? []).join(",")}`; }

type CheckoutResult = { saleId: number; saleNumber: string; totalAmount: string; changeAmount: string; paymentMethod: "cash" | "card" };

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
    const zoom = Math.min(3, Math.max(0.5, Number(product.imageZoom ?? 1)));
    const positionX = Math.min(100, Math.max(0, Number(product.imagePositionX ?? 50)));
    const positionY = Math.min(100, Math.max(0, Number(product.imagePositionY ?? 50)));
    return <span className={compact ? "product-image-frame product-image-frame--compact" : "product-image-frame"}><img className={compact ? "product-image product-image--compact" : "product-image"} src={product.imageUrl} alt={product.name} loading="lazy" style={{ objectPosition: `${positionX}% ${positionY}%`, transform: `scale(${zoom})` }} /></span>;
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
  const outOfStock = stock <= 0;
  return (
    <button className={outOfStock ? "product-tile product-tile--out-of-stock" : "product-tile"} onClick={() => onAdd(product)} title={outOfStock ? "Sin existencias · se permite vender" : `Añadir ${product.name}`}>
      <ProductImage product={product} />
      <span className="product-tile__overlay"><span>{product.name}</span><small>{stock <= 0 ? "Sin stock" : `${euro.format(Number(product.salePrice))} · ${stock} ${product.unit}`}</small></span>
    </button>
  );
}

function CheckoutDialog({ cart, total, onClose, onComplete }: { cart: CartLine[]; total: number; onClose: () => void; onComplete: (method: "cash" | "card", tendered?: number, reference?: string) => void }) {
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const [tendered, setTendered] = useState(String(total.toFixed(2)));
  const tenderedValue = Number(tendered.replace(",", ".")) || 0;
  const exactTendered = tendered.trim().length === 0 ? total : tenderedValue;
  const change = Math.max(0, exactTendered - total);
  const quickAmounts = [1, 2, 5, 10, 20, 50].filter((amount) => total <= 1 || amount >= total);
  const canCompleteCash = tendered.trim().length === 0 || tenderedValue >= total;
  return (
    <div className="checkout-screen" role="dialog" aria-modal="true" aria-labelledby="payment-title">
      <aside className="checkout-ticket"><header><h2>Ticket</h2><button className="icon-button" onClick={onClose} aria-label="Volver al ticket"><ArrowLeft size={20} /></button></header><div className="checkout-ticket__lines">{cart.map((line) => <div key={cartLineIdentity(line)}><span>{line.name} <small>x {line.quantity}</small>{line.promotionComponents?.length ? <small className="checkout-ticket__components">Incluye: {line.promotionComponents.join(" · ")}</small> : null}</span><strong>{euro.format(cartLineTotal(line))}</strong></div>)}</div><div className="checkout-ticket__tax">Impuesto (incluido)</div><div className="checkout-ticket__total"><strong>Total</strong><strong>{euro.format(total)}</strong></div></aside>
      <section className="checkout-payment">
        <header className="checkout-payment__header"><button className="checkout-back" onClick={onClose}><ArrowLeft size={24} /></button><span>PAGO</span></header>
        <div className="checkout-payment__body"><h1 id="payment-title">{euro.format(total)}</h1><p>Cantidad total a pagar</p><div className="checkout-tabs"><button className={method === "cash" ? "checkout-tab checkout-tab--active" : "checkout-tab"} onClick={() => setMethod("cash")}><Banknote size={18} /> Efectivo</button><button className={method === "card" ? "checkout-tab checkout-tab--active" : "checkout-tab"} onClick={() => setMethod("card")}><CreditCard size={18} /> Tarjeta</button></div>{method === "cash" ? <><label className="checkout-money-field"><span>Efectivo recibido <small>Opcional · vacío = importe exacto</small></span><div><Banknote size={22} /><input inputMode="decimal" value={tendered} onChange={(event) => setTendered(event.target.value)} autoFocus placeholder={total.toFixed(2)} /><b>€</b></div></label><div className="quick-cash" aria-label="Importes rápidos">{quickAmounts.map((amount) => <button key={amount} type="button" onClick={() => setTendered(amount.toFixed(2))}><span className={amount <= 2 ? "cash-denomination cash-denomination--coin" : "cash-denomination cash-denomination--bill"}>{amount} €</span><strong>{euro.format(amount)}</strong></button>)}</div><div className="checkout-change"><span>Cambio</span><strong>{euro.format(change)}</strong></div><p className="checkout-cash-hint">Si no indicas cuánto entrega el cliente, se registra el importe exacto del ticket.</p><button className="pay-confirm-button" disabled={!canCompleteCash} onClick={() => onComplete("cash", tendered.trim().length ? tenderedValue : undefined)}><Banknote size={21} /> Cobrar en efectivo</button></> : <button className="card-fast-pay" onClick={() => onComplete("card")}><CreditCard size={58} /><strong>PAGO CON TARJETA</strong><span>Confirma el pago en el datáfono y pulsa aquí para registrarlo</span></button>}</div>
      </section>
    </div>
  );
}

function TicketLineEditor({ line, onClose, onSave }: { line: CartLine; onClose: () => void; onSave: (changes: Pick<CartLine, "quantity" | "unitPriceOverride" | "discountPercent" | "pricingMode">) => void }) {
  const [quantityValue, setQuantityValue] = useState(String(line.quantity));
  const [priceValue, setPriceValue] = useState(String(cartLineBasePrice(line).toFixed(2)));
  const [discountValue, setDiscountValue] = useState(cartLineDiscount(line));
  const baseCost = Number(line.cost ?? 0);
  const save = (pricingMode: "normal" | "discount" | "cost" | "free" = "discount", discountPercent = discountValue, price = Number(priceValue.replace(",", "."))) => {
    const quantity = Math.floor(Number(quantityValue.replace(",", ".")));
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0) return;
    onSave({ quantity, unitPriceOverride: pricingMode === "normal" ? undefined : price, discountPercent: pricingMode === "free" ? 100 : discountPercent, pricingMode });
  };
  return <div className="modal-backdrop ticket-line-editor-backdrop"><section className="ticket-line-editor" role="dialog" aria-modal="true" aria-labelledby="ticket-line-editor-title"><div className="dialog-header"><div><span className="eyebrow">EDITAR LÍNEA</span><h2 id="ticket-line-editor-title">{line.name}</h2></div><button className="post-sale-x-button" onClick={onClose} aria-label="Cerrar"><X size={25} /></button></div><div className="ticket-line-editor__fields"><label>Cantidad<div className="line-quantity-editor"><button type="button" onClick={() => setQuantityValue(String(Math.max(0, Math.floor(Number(quantityValue) || 0) - 1)))} aria-label="Reducir unidades"><Minus size={22} /></button><input type="number" min="0" step="1" inputMode="numeric" value={quantityValue} onChange={(event) => setQuantityValue(event.target.value.replace(/[^0-9]/g, ""))} /><button type="button" onClick={() => setQuantityValue(String(Math.max(0, Math.floor(Number(quantityValue) || 0) + 1)))} aria-label="Aumentar unidades"><Plus size={22} /></button></div></label><label>Precio base<input inputMode="decimal" value={priceValue} onChange={(event) => { setPriceValue(event.target.value); setDiscountValue(0); }} /></label></div><div className="ticket-line-editor__current"><span>Precio de coste: <strong>{euro.format(baseCost)}</strong></span><span>Precio aplicado: <strong>{euro.format(cartLineUnitPrice(line))}</strong></span></div><div className="ticket-line-editor__discounts"><button type="button" className={discountValue === 0 && Number(priceValue.replace(",", ".")) === Number(line.salePrice) ? "discount-option discount-option--selected" : "discount-option"} onClick={() => { setPriceValue(Number(line.salePrice).toFixed(2)); setDiscountValue(0); }}><strong>Precio normal</strong><small>{euro.format(Number(line.salePrice))}</small></button><button type="button" className={discountValue === 10 ? "discount-option discount-option--selected" : "discount-option"} onClick={() => { setPriceValue(Number(line.salePrice).toFixed(2)); setDiscountValue(10); }}><strong>-10%</strong><small>{euro.format(Number(line.salePrice) * .9)}</small></button><button type="button" className={discountValue === 25 ? "discount-option discount-option--selected" : "discount-option"} onClick={() => { setPriceValue(Number(line.salePrice).toFixed(2)); setDiscountValue(25); }}><strong>-25%</strong><small>{euro.format(Number(line.salePrice) * .75)}</small></button><button type="button" disabled={baseCost <= 0} className={discountValue === 0 && baseCost > 0 && Number(priceValue.replace(",", ".")) === baseCost ? "discount-option discount-option--selected" : "discount-option"} onClick={() => { setPriceValue(baseCost.toFixed(2)); setDiscountValue(0); }}><strong>Precio de coste</strong><small>{baseCost > 0 ? euro.format(baseCost) : "Coste no informado"}</small></button><button type="button" className={discountValue === 100 ? "discount-option discount-option--selected" : "discount-option"} onClick={() => { setPriceValue(Number(line.salePrice).toFixed(2)); setDiscountValue(100); }}><strong>100% descuento</strong><small>0,00 €</small></button></div><p className="helper-text">El descuento se aplica a esta línea y el stock se descuenta normalmente.</p><div className="ticket-line-editor__actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={() => save(discountValue === 0 && Number(priceValue.replace(",", ".")) === Number(line.salePrice) ? "normal" : discountValue === 100 ? "free" : discountValue === 0 && Number(priceValue.replace(",", ".")) === baseCost ? "cost" : "discount", discountValue)}><Check size={17} /> Aplicar</button></div></section></div>;
}

function PromotionSelector({ product, promotion, onClose, onConfirm }: { product: Product; promotion: Promotion; onClose: () => void; onConfirm: (selections: Array<{ productId: number; productName: string }>) => void }) {
  const [selections, setSelections] = useState<Record<number, number>>({});
  const ready = promotion.slots.every((slot) => selections[slot.id]);
  return <div className="modal-backdrop promotion-selector-backdrop"><section className="promotion-selector" role="dialog" aria-modal="true" aria-labelledby="promotion-selector-title"><div className="dialog-header"><div><span className="eyebrow">PROMOCIÓN</span><h2 id="promotion-selector-title">{promotion.name}</h2><p>{euro.format(Number(promotion.comboPrice))} · Elige una opción de cada familia</p></div><button className="post-sale-x-button" onClick={onClose} aria-label="Cerrar"><X size={25} /></button></div><div className="promotion-selector__choices">{promotion.slots.map((slot, index) => <section className="promotion-choice-group" key={slot.id}><div><span className="eyebrow">OPCIÓN {index + 1}</span><h3>{slot.label}</h3></div><div className="promotion-choice-grid">{slot.products.map((choice) => <button className={selections[slot.id] === choice.productId ? "promotion-choice promotion-choice--selected" : "promotion-choice"} key={choice.productId} onClick={() => setSelections((current) => ({ ...current, [slot.id]: choice.productId }))}><span>{choice.productName}</span>{selections[slot.id] === choice.productId && <Check size={18} />}</button>)}</div></section>)}</div><p className="helper-text">Se descontará una unidad del stock de cada artículo seleccionado.</p><div className="promotion-selector__footer"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!ready} onClick={() => onConfirm(promotion.slots.map((slot) => { const productId = selections[slot.id]; return { productId, productName: slot.products.find((productOption) => productOption.productId === productId)?.productName ?? "Artículo" }; }))}>Añadir combo · {euro.format(Number(promotion.comboPrice))}</button></div></section></div>;
}

function formatOpenTicketDate(value: string) {
  return new Date(value).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function OpenTicketsDialog({ tickets, mode, cartCount, cartTotal, saving, loading, error, onClose, onSave, onLoad, onClear, onRetry }: { tickets: OpenTicket[]; mode: "save" | "load"; cartCount: number; cartTotal: number; saving: boolean; loading: boolean; error: string | null; onClose: () => void; onSave: (slotNumber: number) => void; onLoad: (ticket: OpenTicket) => void; onClear: (slotNumber: number) => void; onRetry: () => void }) {
  const normalizedTickets = tickets.map((ticket) => ({ ...ticket, cart: normalizeOpenTicketCart(ticket.cart) }));
  const bySlot = new Map(normalizedTickets.map((ticket) => [ticket.slotNumber, ticket]));
  return <div className="modal-backdrop open-tickets-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="open-tickets-dialog" role="dialog" aria-modal="true" aria-labelledby="open-tickets-title"><div className="dialog-header"><div><span className="eyebrow">TICKETS ABIERTOS</span><h2 id="open-tickets-title">{mode === "save" ? "Guardar ticket" : "Abrir ticket"}</h2><p>{mode === "save" ? `${cartCount} artículos · ${euro.format(cartTotal)}` : "Selecciona una posición guardada para recuperarla."}</p></div><button type="button" className="post-sale-x-button" onClick={onClose} aria-label="Cerrar"><X size={25} /></button></div>{loading ? <div className="open-tickets-state">Cargando tickets guardados…</div> : error ? <div className="open-tickets-state open-tickets-state--error"><strong>No se han podido cargar los tickets abiertos.</strong><small>{error}</small><button type="button" className="secondary-button" onClick={onRetry}>Reintentar</button></div> : <div className="open-tickets-grid">{Array.from({ length: 10 }, (_, index) => index + 1).map((slotNumber) => { const ticket = bySlot.get(slotNumber); return <article className={ticket ? "open-ticket-slot open-ticket-slot--filled" : "open-ticket-slot"} key={slotNumber}><div className="open-ticket-slot__heading"><strong>Ticket {slotNumber}</strong><span>{ticket ? `${ticket.cart.length} líneas` : "Vacío"}</span></div>{ticket ? <small>Último guardado<br /><b>{formatOpenTicketDate(ticket.savedAt)}</b></small> : <small className="open-ticket-slot__empty">Sin ticket guardado</small>}<div className="open-ticket-slot__actions">{mode === "save" ? <button type="button" className="secondary-button secondary-button--small" disabled={saving} onClick={(event) => { event.preventDefault(); onSave(slotNumber); }}>{saving ? "Guardando…" : ticket ? "Reemplazar" : "Guardar aquí"}</button> : <button type="button" className="primary-button primary-button--small" disabled={!ticket} onClick={(event) => { event.preventDefault(); if (ticket) onLoad(ticket); }}>Abrir</button>}{ticket && <button type="button" className="table-icon-button table-icon-button--danger" onClick={(event) => { event.preventDefault(); onClear(slotNumber); }} aria-label={`Eliminar ticket ${slotNumber}`} title={`Eliminar ticket ${slotNumber}`}><Trash2 size={15} /></button>}</div></article>; })}</div>}<p className="helper-text">Puedes mantener hasta diez tickets abiertos. La fecha y hora corresponden al último guardado de cada posición.</p></section></div>;
}

function PosScreen({ onOpenMenu }: { onOpenMenu: () => void }) {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [order, setOrder] = useState<"popular" | "alphabetical">("popular");
  const [search, setSearch] = useState("");
  const isSearching = search.trim().length > 0;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [isPaying, setIsPaying] = useState(false);
  const [ticketMenuOpen, setTicketMenuOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<CheckoutResult | null>(null);
  const [editingLineKey, setEditingLineKey] = useState<string | null>(null);
  const [promotionChoice, setPromotionChoice] = useState<{ product: Product; promotion: Promotion } | null>(null);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [openTicketsMode, setOpenTicketsMode] = useState<"save" | "load" | null>(null);
  const [activeOpenTicketSlot, setActiveOpenTicketSlot] = useState<number | null>(null);

  const openTicketsQuery = useQuery({ queryKey: ["open-tickets"], queryFn: () => api<OpenTicket[]>("/open-tickets") });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  const catalogQuery = useQuery({
    queryKey: ["catalog", isSearching ? null : selectedCategory, order],
    queryFn: () => api<Product[]>(`/catalog?order=${order}${!isSearching && selectedCategory ? `&categoryId=${selectedCategory}` : ""}`),
  });
  const featuredQuery = useQuery({ queryKey: ["featured"], queryFn: () => api<Product[]>("/catalog/featured"), enabled: selectedCategory === null && !isSearching });
  const saveOpenTicketMutation = useMutation({
    mutationFn: (input: { slotNumber: number; cart: CartLine[] }) => api<OpenTicket>(`/open-tickets/${input.slotNumber}`, { method: "PUT", body: JSON.stringify({ cart: input.cart }) }),
    onSuccess: (_ticket, input) => { setCart([]); setActiveOpenTicketSlot(null); setOpenTicketsMode(null); queryClient.invalidateQueries({ queryKey: ["open-tickets"] }); toast.success(`Ticket ${input.slotNumber} guardado`, { description: "Ticket actual despejado. Puedes recuperarlo desde Abrir ticket." }); },
    onError: (error) => toast.error("No se ha podido guardar el ticket", { description: error.message }),
  });
  const clearOpenTicketMutation = useMutation({
    mutationFn: (slotNumber: number) => api<{ success: boolean }>(`/open-tickets/${slotNumber}`, { method: "DELETE" }),
    onSuccess: (_result, slotNumber) => { if (activeOpenTicketSlot === slotNumber) setActiveOpenTicketSlot(null); queryClient.invalidateQueries({ queryKey: ["open-tickets"] }); },
    onError: (error) => toast.error("No se ha podido eliminar el ticket guardado", { description: error.message }),
  });
  const checkoutMutation = useMutation({
    mutationFn: (payload: { method: "cash" | "card"; tendered?: number; reference?: string }) => api<CheckoutResult>("/checkout", {
      method: "POST",
      body: JSON.stringify({
        lines: cart.map((line) => ({ productId: line.id, quantity: line.quantity, unitPrice: line.unitPriceOverride, discountPercent: line.discountPercent, pricingMode: line.pricingMode, promotionId: line.promotionId ?? undefined, promotionSelections: line.promotionSelections })),
        paymentMethod: payload.method,
        receivedAmount: payload.tendered,
        terminalReference: payload.reference,
      }),
    }),
    onSuccess: (result) => {
       setCart([]);
       setIsPaying(false);
       setCompletedSale(result);
       if (activeOpenTicketSlot !== null) { clearOpenTicketMutation.mutate(activeOpenTicketSlot); setActiveOpenTicketSlot(null); }
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
      else if (reason === "manual") toast.message("Cajón no configurado", { description: result.message });
    } catch (error) {
      toast.error("No se ha podido abrir el cajón", { description: error instanceof Error ? error.message : "Error de comunicación" });
    }
  };

  const saveCurrentOpenTicket = (slotNumber: number) => {
    const existing = (openTicketsQuery.data ?? []).find((ticket) => ticket.slotNumber === slotNumber);
    if (existing && !window.confirm(`El ticket ${slotNumber} ya contiene un ticket guardado el ${formatOpenTicketDate(existing.savedAt)}. ¿Reemplazarlo?`)) return;
    saveOpenTicketMutation.mutate({ slotNumber, cart });
  };
  const loadOpenTicket = (ticket: OpenTicket) => {
    if (cart.length && !window.confirm("El ticket actual se reemplazará por el ticket guardado. ¿Continuar?")) return;
    const normalizedCart = normalizeOpenTicketCart(ticket.cart);
    if (!normalizedCart.length) { toast.error(`El ticket ${ticket.slotNumber} no contiene líneas válidas.`); return; }
    setCart(normalizedCart);
    setActiveOpenTicketSlot(ticket.slotNumber);
    setOpenTicketsMode(null);
    toast.success(`Ticket ${ticket.slotNumber} abierto`, { description: `Guardado el ${formatOpenTicketDate(ticket.savedAt)}` });
  };
  const selectedCategoryData = categoriesQuery.data?.find((category) => category.id === selectedCategory) ?? null;
  const childCategories = selectedCategory === null ? [] : (categoriesQuery.data ?? []).filter((category) => category.parentCategoryId === selectedCategory);
  const rootCategories = (categoriesQuery.data ?? []).filter((category) => category.parentCategoryId === null);
  const allProducts = isSearching ? (catalogQuery.data ?? []) : selectedCategory === null ? (featuredQuery.data ?? catalogQuery.data ?? []) : (catalogQuery.data ?? []);
  const visibleProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    if (!term) return allProducts;
    return allProducts.filter((product) => `${product.name} ${product.sku ?? ""} ${product.barcode ?? ""}`.toLocaleLowerCase("es").includes(term));
  }, [allProducts, search]);
  const totalUnits = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + cartLineTotal(line), 0);

  const addToCart = async (product: Product) => {
    if (product.promotionId) {
      setPromotionLoading(true);
      try {
        const promotion = await api<Promotion>(`/promotions/${product.promotionId}`);
        setPromotionChoice({ product, promotion });
      } catch (error) {
        toast.error("No se ha podido cargar la promoción", { description: error instanceof Error ? error.message : "Error de comunicación" });
      } finally {
        setPromotionLoading(false);
      }
      return;
    }
    setCart((current) => {
      const existing = current.find((line) => line.id === product.id && !line.promotionId);
      if (existing) {
        return current.map((line) => line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
        return [...current, { ...product, quantity: 1, pricingMode: "normal" }];
    });
  };
  const addPromotionToCart = (selections: Array<{ productId: number; productName: string }>) => {
    if (!promotionChoice) return;
    const { product, promotion } = promotionChoice;
    setCart((current) => {
      const selectedIds = selections.map((selection) => selection.productId);
      const existing = current.find((line) => line.id === product.id && line.promotionId === promotion.id && JSON.stringify(line.promotionSelections ?? []) === JSON.stringify(selectedIds));
      if (existing) return current.map((line) => line === existing ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { ...product, quantity: 1, promotionId: promotion.id, promotionSelections: selectedIds, promotionComponents: selections.map((selection) => selection.productName), pricingMode: "promotion" }];
    });
    setPromotionChoice(null);
  };
  const updateCartQuantity = (lineKey: string, delta: number) => {
    setCart((current) => current.flatMap((line) => {
      if (cartLineIdentity(line) !== lineKey) return [line];
      const next = line.quantity + delta;
      if (next <= 0) return [];
      return [{ ...line, quantity: next }];
    }));
  };
  const updateCartLine = (lineKey: string, changes: Pick<CartLine, "quantity" | "unitPriceOverride" | "discountPercent" | "pricingMode">) => {
    setCart((current) => changes.quantity <= 0 ? current.filter((line) => cartLineIdentity(line) !== lineKey) : current.map((line) => cartLineIdentity(line) === lineKey ? { ...line, ...changes } : line));
    setEditingLineKey(null);
  };

  return (
    <main className="pos-shell">
      <section className="catalog-panel">
        <header className="pos-header">
          <div className="pos-header__left">{selectedCategory !== null ? <button className="pos-header__icon" onClick={() => setSelectedCategory(selectedCategoryData?.parentCategoryId ?? null)} aria-label={selectedCategoryData?.parentCategoryId ? "Volver a familia" : "Volver a familias"}><ArrowLeft size={26} /></button> : <button className="pos-header__icon pos-header__menu-button" onClick={onOpenMenu} aria-label="Abrir menú principal"><Menu size={30} /></button>}<div className="pos-header__title"><strong>{selectedCategory !== null ? categoriesQuery.data?.find((category) => category.id === selectedCategory)?.name ?? "Familia" : "Venta"}</strong><small>Sweet &amp; Salty</small></div><button className="pos-home-button" onClick={() => { setSelectedCategory(null); setSearch(""); setOrder("popular"); }}><LayoutGrid size={16} /> INICIO</button></div>
          <div className="header-actions"><button className="pos-header__icon" aria-label="Buscar"><Search size={25} /></button><span className="register-status"><i /> Caja abierta</span></div>
        </header>
        <div className="catalog-toolbar">
          <div><span className="eyebrow">VENTA RÁPIDA</span><h1>{selectedCategory ? categoriesQuery.data?.find((category) => category.id === selectedCategory)?.name : "Familias y destacados"}</h1></div>
          <div className="toolbar-actions">
            <label className="search-field"><Search size={18} /><input placeholder="Buscar artículo o código" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
            <button className="sort-button" onClick={() => setOrder((current) => current === "popular" ? "alphabetical" : "popular")}><span>{order === "popular" ? "Más vendidos" : "A–Z"}</span><ChevronDown size={16} /></button>
          </div>
        </div>

        {selectedCategory === null && !isSearching && (
          <section className="families-section">
            <div className="section-heading"><h2>Familias</h2><span>{categoriesQuery.data?.length ?? 0} grupos</span></div>
            <div className="family-grid">
               {categoriesQuery.isLoading ? <div className="empty-inline">Cargando familias…</div> : rootCategories.map((category) => <button key={category.id} className={category.imageUrl ? "family-card family-card--image" : "family-card"} onClick={() => setSelectedCategory(category.id)} style={{ "--family-color": category.color } as React.CSSProperties}>{category.imageUrl && <span className="family-card__image" style={{ backgroundImage: `url(${category.imageUrl})` }} />}{!category.imageUrl && <CategoryVisual category={category} compact />}<span>{category.name}</span>{(categoriesQuery.data ?? []).some((child) => child.parentCategoryId === category.id) ? <ChevronRight size={16} /> : <Plus size={16} />}</button>)}
            </div>
          </section>
        )}

        {selectedCategory !== null && !isSearching && childCategories.length > 0 && <section className="families-section subfamilies-section"><div className="section-heading"><h2>Subfamilias de {selectedCategoryData?.name}</h2><span>{childCategories.length} subfamilias</span></div><div className="family-grid">{childCategories.map((category) => <button key={category.id} className={category.imageUrl ? "family-card family-card--image" : "family-card"} onClick={() => setSelectedCategory(category.id)} style={{ "--family-color": category.color } as React.CSSProperties}>{category.imageUrl && <span className="family-card__image" style={{ backgroundImage: `url(${category.imageUrl})` }} />}{!category.imageUrl && <CategoryVisual category={category} compact />}<span>{category.name}</span><Plus size={16} /></button>)}</div></section>}

        <section className="products-section">
          <div className="section-heading"><h2>{isSearching ? `Resultados para «${search.trim()}»` : selectedCategory === null ? "Más vendidos" : "Artículos"}</h2>{isSearching ? <button className="text-button" onClick={() => setSearch("")}>Limpiar búsqueda</button> : selectedCategory !== null && <button className="text-button" onClick={() => setSelectedCategory(null)}>Volver a familias</button>}</div>
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
          {cart.length === 0 ? <div className="empty-ticket"><div><ReceiptText size={28} /></div><strong>El ticket está vacío</strong><span>Selecciona artículos del catálogo para empezar.</span></div> : cart.map((line) => <article className="ticket-line ticket-line--editable" key={cartLineIdentity(line)} onClick={() => setEditingLineKey(cartLineIdentity(line))} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setEditingLineKey(cartLineIdentity(line)); }} aria-label={`Editar ${line.name}`}><ProductImage product={line} compact /><div className="ticket-line__info"><strong>{line.name}</strong><span>× {line.quantity} · {euro.format(cartLineUnitPrice(line))} / {line.unit}{cartLineDiscount(line) > 0 ? ` · -${cartLineDiscount(line)}%` : ""}</span>{line.promotionComponents?.length ? <div className="ticket-line__components"><small>Incluye:</small>{line.promotionComponents.map((component, index) => <span key={`${component}-${index}`}>{component}</span>)}</div> : null}<div className="quantity-control"><button onClick={(event) => { event.stopPropagation(); updateCartQuantity(cartLineIdentity(line), -1); }} aria-label={`Restar ${line.name}`}><Minus size={15} /></button><span>{line.quantity}</span><button onClick={(event) => { event.stopPropagation(); updateCartQuantity(cartLineIdentity(line), 1); }} aria-label={`Sumar ${line.name}`}><Plus size={15} /></button></div></div><div className="ticket-line__total"><strong>{euro.format(cartLineTotal(line))}</strong><button onClick={(event) => { event.stopPropagation(); updateCartQuantity(cartLineIdentity(line), -line.quantity); }} aria-label={`Eliminar ${line.name}`}><X size={16} /></button></div></article>)}
        </div>
        <footer className="ticket-footer"><div className="ticket-summary"><div><span>Subtotal</span><strong>{euro.format(cartTotal)}</strong></div><div><span>Descuentos</span><strong>{euro.format(cart.reduce((sum, line) => sum + Math.max(0, (Number(line.salePrice) - cartLineUnitPrice(line)) * line.quantity), 0))}</strong></div><div><span>IVA incluido</span><strong>{euro.format(cart.reduce((sum, line) => sum + cartLineVat(line), 0))}</strong></div><div className="ticket-total"><span>Total</span><strong>{euro.format(cartTotal)}</strong></div></div><div className="ticket-footer__actions"><div className="ticket-open-actions"><button type="button" className="save-ticket-button" disabled={!cart.length || saveOpenTicketMutation.isPending} onClick={() => setOpenTicketsMode("save")}><ReceiptText size={17} /> Guardar ticket</button><button type="button" className="open-ticket-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpenTicketsMode("load"); }}><Folder size={17} /> Abrir ticket</button></div><button className="charge-button" disabled={!cart.length || checkoutMutation.isPending} onClick={() => setIsPaying(true)}>{checkoutMutation.isPending ? "Procesando…" : <><CreditCard size={20} /> Cobrar {cart.length ? euro.format(cartTotal) : ""}</>}</button></div><div className="ticket-footnote"><Barcode size={14} /> Escanea un código o usa la búsqueda</div></footer>
      </aside>
      {editingLineKey !== null && cart.find((line) => cartLineIdentity(line) === editingLineKey) && <TicketLineEditor line={cart.find((line) => cartLineIdentity(line) === editingLineKey)!} onClose={() => setEditingLineKey(null)} onSave={(changes) => updateCartLine(editingLineKey, changes)} />}
      {promotionLoading && <div className="modal-backdrop"><section className="promotion-selector"><div className="admin-empty">Cargando promoción…</div></section></div>}
      {promotionChoice && <PromotionSelector product={promotionChoice.product} promotion={promotionChoice.promotion} onClose={() => setPromotionChoice(null)} onConfirm={addPromotionToCart} />}
      {isPaying && <CheckoutDialog cart={cart} total={cartTotal} onClose={() => !checkoutMutation.isPending && setIsPaying(false)} onComplete={(method, tendered, reference) => checkoutMutation.mutate({ method, tendered, reference })} />}
      {openTicketsMode && <OpenTicketsDialog tickets={openTicketsQuery.data ?? []} mode={openTicketsMode} cartCount={totalUnits} cartTotal={cartTotal} saving={saveOpenTicketMutation.isPending} loading={openTicketsQuery.isLoading} error={openTicketsQuery.error instanceof Error ? openTicketsQuery.error.message : openTicketsQuery.error ? "Error de comunicación con el servidor." : null} onRetry={() => { void openTicketsQuery.refetch(); }} onClose={() => !saveOpenTicketMutation.isPending && setOpenTicketsMode(null)} onSave={saveCurrentOpenTicket} onLoad={loadOpenTicket} onClear={(slotNumber) => { if (window.confirm(`¿Eliminar el ticket ${slotNumber} guardado?`)) clearOpenTicketMutation.mutate(slotNumber); }} />}
      {completedSale && <PostSaleActions result={completedSale} onClose={() => setCompletedSale(null)} />}
    </main>
  );
}

function PostSaleActions({ result, onClose }: { result: CheckoutResult; onClose: () => void }) {
  const [recipient, setRecipient] = useState("");
  const [emailFieldFocused, setEmailFieldFocused] = useState(false);
  const [secondsToClose, setSecondsToClose] = useState(30);
  const detailsQuery = useQuery({ queryKey: ["completed-sale", result.saleId], queryFn: () => api<SaleDetails>(`/sales/${result.saleId}`) });
  const emailStatusQuery = useQuery({ queryKey: ["email-status"], queryFn: () => api<{ configured: boolean; message: string }>("/email/status") });
  const emailMutation = useMutation({
    mutationFn: () => api<{ success: boolean }>(`/sales/${result.saleId}/email`, { method: "POST", body: JSON.stringify({ recipient: recipient.trim() }) }),
    onSuccess: () => { toast.success("Ticket enviado por correo", { description: recipient.trim() }); },
    onError: (error) => toast.error("No se ha podido enviar el ticket", { description: error.message }),
  });
  const emailReady = emailStatusQuery.data?.configured === true;
  const autoClosePaused = emailFieldFocused || emailMutation.isPending;
  useEffect(() => {
    if (autoClosePaused) return;
    setSecondsToClose(30);
    const intervalId = window.setInterval(() => setSecondsToClose((seconds) => Math.max(0, seconds - 1)), 1000);
    const timeoutId = window.setTimeout(onClose, 30_000);
    return () => { window.clearInterval(intervalId); window.clearTimeout(timeoutId); };
  }, [autoClosePaused, onClose]);
  return <div className="modal-backdrop post-sale-backdrop"><section className="post-sale-dialog" role="dialog" aria-modal="true" aria-labelledby="post-sale-title"><div className="dialog-header"><div><span className="eyebrow">VENTA COMPLETADA</span><h2 id="post-sale-title">{result.saleNumber}</h2><p className="post-sale-total">{euro.format(Number(result.totalAmount))}</p></div><button className="post-sale-x-button" onClick={onClose} aria-label="Cerrar"><X size={24} /></button></div><p className="helper-text">Elige cómo entregar el ticket al cliente.</p><div className="post-sale-actions"><button className="primary-button" disabled={!detailsQuery.data} onClick={() => detailsQuery.data && void printSaleReceipt(detailsQuery.data)}><Printer size={18} /> Imprimir ticket</button><button className="secondary-button" disabled={emailMutation.isPending || !recipient.trim() || !emailReady} onClick={() => emailMutation.mutate()}><Mail size={18} /> {emailMutation.isPending ? "Enviando…" : "Enviar por correo"}</button></div><label className="post-sale-email"><span>Correo del cliente</span><input type="email" disabled={!emailReady} value={recipient} onFocus={() => setEmailFieldFocused(true)} onBlur={() => setEmailFieldFocused(false)} onChange={(event) => setRecipient(event.target.value)} placeholder="cliente@ejemplo.com" /></label><small className={emailReady ? "helper-text" : "helper-text post-sale-email-status"}>{emailStatusQuery.isLoading ? "Comprobando correo…" : emailStatusQuery.data?.message ?? "No se pudo comprobar el estado del correo."}</small><div className="post-sale-close-area"><small>{autoClosePaused ? "El cierre automático está pausado mientras escribes o se envía el correo." : `La ventana se cerrará automáticamente en ${secondsToClose} s.`}</small><button className="post-sale-close-button" onClick={onClose}><X size={18} /> CERRAR</button></div></section></div>;
}

type AdminProduct = Product & { lastPurchaseCost: string; weightedAverageCost: string; lastPurchaseCostBeforeSurcharge: string; weightedAverageCostBeforeSurcharge: string; cost: string; minimumStock: string; isFeatured: boolean; showInTpv: boolean; isActive: boolean; updatedAt: string };
type QuickProductPatch = { categoryId?: number; salePrice?: number; minimumStock?: number; vatTypeId?: number | null; barcode?: string | null; weightedAverageCost?: number; lastPurchaseCost?: number };
type Supplier = { id: number; name: string; legalName: string | null; taxId: string | null; phone: string | null; email: string | null; isActive: boolean };
type SaleRow = { id: number; saleNumber: string; totalAmount: string; status: string; createdAt: string; method: "cash" | "card" | null };
type SaleDetails = { id: number; saleNumber: string; subtotal: string; vatAmount: string; totalAmount: string; status: string; createdAt: string; payment: { method: "cash" | "card"; amount: string; receivedAmount: string | null; changeAmount: string; terminalReference: string | null } | null; fiscal?: { invoiceNumber: string; record?: { qrPayload: string | null; recordHash: string; submissionStatus: string } | null } | null; lines: Array<{ id: number; productName: string; quantity: string; unitPrice: string; lineVat: string; lineTotal: string }> };
type ReportRow = { productId: number | null; productName: string; units: string; revenue: string; cost: string; margin: string };
type PurchaseRow = { id: number; invoiceNumber: string | null; invoiceDate: string | null; totalAmount: string; ocrStatus: string; status: string; supplierName: string | null; createdAt: string };
type RecognizedInvoiceLine = { lineId: number; description: string; supplierReference: string | null; productId?: number; quantity: number; unitCost: number; lineTotal: number };
type RecognizedInvoice = { id: number; supplierName: string | null; invoiceNumber: string | null; invoiceDate: string | null; subtotal: number | null; vatRate: number | null; vatAmount: number | null; totalAmount: number | null; lines: RecognizedInvoiceLine[]; confidenceNote: string };
type InvoiceRecognitionResponse = { data: Omit<RecognizedInvoice, "id" | "lines"> & { lines: Array<{ description: string; supplierReference: string | null; quantity: number | null; unitCost: number | null; lineTotal: number | null }> }; draft: { id: number; lineIds: number[] } };
type CashSummary = { id: number; businessDate: string; openingFloat: string; expectedCash: string; countedCash: string | null; cardTotal: string; totalSold: string; difference: string | null; status: "open" | "closed"; denominationCounts?: Record<string, number> | null; countedCard?: string | null; notes?: string | null; businessTimezone?: string; businessDayStartsAt?: string };
type CashSessionRow = CashSummary & { openedAt: string; closedAt: string | null };
type DailyAnalysis = { businessDate: string; sessionId: number; status: "open" | "closed"; totalSold: string; cashSold: string; cardSold: string; expectedCash: string; tickets: number; hourly: Array<{ hour: number; label: string; total: string; tickets: number; cash: string; card: string }>; topProducts: Array<{ productId: number | null; productName: string; units: string; revenue: string }> };
type ReportsData = {
  period: string; group?: "hour" | "day" | "week" | "month"; from: string; to: string;
  totals: { totalSold: string; subtotal: string; vat: string; cash: string; card: string; cost: string; margin: string; tickets: number };
  series: Array<{ label: string; total: string; tickets: number; cash: string; card: string; cost?: string; margin?: string }>;
  topProducts: Array<{ productId: number | null; productName: string; units: string; revenue: string; cost: string; margin: string }>;
  byFamily: Array<{ family: string; units: string; revenue: string; cost: string; margin: string }>;
  vatBreakdown: Array<{ vat: string; revenue: string; vatAmount: string; units: string }>;
};
type FiscalReadiness = {
  mode: "test";
  profile: { commercialName: string; legalName: string; taxId: string; addressLine1: string; postalCode: string; city: string; softwareName: string; softwareVersion: string; certificateStatus: string; submissionEnvironment: string } | null;
  totalRecords: number;
  submissionQueue?: { blocked: number; total: number; enabled: boolean };
  readiness: { immutableRecords: boolean; sha256Chain: boolean; qrPreparation: boolean; aeatSubmission: boolean; certificateConfigured: boolean };
  notice: string;
  records: Array<{ id: number; fiscalInvoiceId: number; invoiceNumber: string; recordType: string; chainPosition: number; algorithm: string; previousHash: string | null; recordHash: string; submissionStatus: string; submissionMessage: string | null; generatedAt: string; totalAmount: string }>;
};
type FiscalVerification = { valid: boolean; checkedRecords: number; problems: Array<{ id: number; chainPosition: number; message: string }> };

type AdminTab = "analysis" | "reports" | "fiscal" | "overview" | "categories" | "promotions" | "products" | "inventory" | "suppliers" | "purchases" | "sales" | "cash" | "settings" | "loyverse";
type PosSettings = { businessName: string; currency: string; timezone: string; businessDayStartsAt: string; defaultVatRate: string; smtpHost: string | null; smtpPort: number; smtpSecure: boolean; smtpUser: string | null; smtpFrom: string | null; smtpPasswordConfigured: boolean; smtpSource: "database" | "environment" | "none"; loyverseApiBaseUrl: string; loyverseStoreId: string | null; loyverseTokenConfigured: boolean; loyverseTokenSource: "database" | "environment" | "none" };
type LoyverseStatus = { configured: boolean; apiBase: string; state: { merchantName: string | null; activeStoreId: string | null; activeStoreName: string | null; catalogSyncedAt: string | null; salesSyncedAt: string | null; lastSyncFinishedAt: string | null; lastSyncStatus: string; lastSyncError: string | null } | null; counts: { stores: number; categories: number; items: number; variants: number; prices: number; inventoryLevels: number; receipts: number; receiptLines: number; shifts: number } };
type LoyverseSettings = { loyverseApiBaseUrl: string; loyverseStoreId: string | null; loyverseTokenConfigured: boolean; loyverseTokenSource: "database" | "environment" | "none" };
type LoyverseConfigForm = { apiBaseUrl: string; apiToken: string; storeId: string; clearToken: boolean };
type LoyverseCatalogRow = { id: string; name: string; category: string; imageUrl: string | null; sku: string | null; barcode: string | null; variants: number; price: number | null; cost: number | null; stock: number; availableForSale: boolean; deleted: boolean; updatedAt: string | null };
type LoyverseDashboard = { configured: boolean; selectedStoreId: string | null; stores: Array<{ loyverseId: string; name: string; timezone: string | null }>; catalog: LoyverseCatalogRow[]; sales: { from: string | null; to: string | null; tickets: number; totalSold: number; totalTax: number; totalDiscount: number; totalCost: number; margin: number; byHour: Array<{ hour: string; tickets: number; total: number }>; byDate: Array<{ date: string; tickets: number; total: number }>; topProducts: Array<{ productName: string; units: number; revenue: number; cost: number }>; recentReceipts: Array<{ id: number; receiptNumber: string; receiptType: string | null; receiptDate: string | null; totalMoney: string; totalTax: string; totalDiscount: string; storeLoyverseId: string | null }> }; updatedAt: string | null };
type PromotionSlot = { id: number; position: number; label: string; categoryId: number; products: Array<{ productId: number; productName: string }> };
type Promotion = { id: number; productId: number; name: string; comboPrice: string; isActive: boolean; productName: string; categoryId: number; categoryName: string; slots: PromotionSlot[] };
type PromotionDraftSlot = { label: string; categoryId: string; productIds: number[] };

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function AdminScreen({ onBack, onOpenMenu }: { onBack: () => void; onOpenMenu: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [reportPeriod, setReportPeriod] = useState("day");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportSource, setReportSource] = useState<"all" | "loyverse" | "local">("all");
  const [reportGroup, setReportGroup] = useState<"auto" | "hour" | "day" | "week" | "month">("auto");
  const [reportMetric, setReportMetric] = useState<"total" | "tickets" | "cash" | "card" | "cost" | "margin">("total");
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", parentCategoryId: "", color: "#4C8A5A", iconName: "Folder", isPromotion: false });
  const [categoryImageUrl, setCategoryImageUrl] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({ name: "", salePrice: "", initialStock: "", categoryId: "", vatTypeId: "", vatRate: "10", barcode: "", minimumStock: "0", imageZoom: 1, imagePositionX: 50, imagePositionY: 50 });
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
  const [smtpForm, setSmtpForm] = useState({ smtpHost: "", smtpPort: "587", smtpSecure: false, smtpUser: "", smtpPassword: "", smtpFrom: "", clearPassword: false });
  const [editingCashId, setEditingCashId] = useState<number | null>(null);
  const [cashEditForm, setCashEditForm] = useState({ countedCash: "", countedCard: "", notes: "" });
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");
  const [productStockFilter, setProductStockFilter] = useState<"all" | "low" | "empty">("all");
  const [productSort, setProductSort] = useState<"name" | "price" | "stock" | "sold" | "cost" | "family">("name");
  const [loyverseStoreId, setLoyverseStoreId] = useState("");
  const [loyverseFrom, setLoyverseFrom] = useState("");
  const [loyverseTo, setLoyverseTo] = useState("");
  const [loyverseConfigForm, setLoyverseConfigForm] = useState({ apiBaseUrl: "https://api.loyverse.com/v1.0", apiToken: "", storeId: "", clearToken: false });
  const [promotionFormOpen, setPromotionFormOpen] = useState(false);
  const [promotionForm, setPromotionForm] = useState({ productId: "", name: "", comboPrice: "", slots: [{ label: "", categoryId: "", productIds: [] as number[] }] as PromotionDraftSlot[] });

  const categoriesQuery = useQuery({ queryKey: ["admin-categories"], queryFn: () => api<Category[]>("/admin/categories") });
  const vatTypesQuery = useQuery({ queryKey: ["admin-vat-types"], queryFn: () => api<VatType[]>("/admin/vat-types") });
  const productsQuery = useQuery({ queryKey: ["admin-products"], queryFn: () => api<AdminProduct[]>("/admin/products") });
  const suppliersQuery = useQuery({ queryKey: ["admin-suppliers"], queryFn: () => api<Supplier[]>("/admin/suppliers") });
  const promotionsQuery = useQuery({ queryKey: ["admin-promotions"], queryFn: () => api<Promotion[]>("/admin/promotions") });
  const salesQuery = useQuery({ queryKey: ["admin-sales"], queryFn: () => api<SaleRow[]>("/sales?limit=100") });
  const reportQuery = useQuery({ queryKey: ["admin-sales-report"], queryFn: () => api<ReportRow[]>("/admin/reports/sales-by-product") });
  const invoicesQuery = useQuery({ queryKey: ["admin-purchase-invoices"], queryFn: () => api<PurchaseRow[]>("/admin/purchase-invoices") });
  const cashQuery = useQuery({ queryKey: ["cash"], queryFn: () => api<CashSummary>("/cash/current") });
  const analysisQuery = useQuery({ queryKey: ["daily-analysis"], queryFn: () => api<DailyAnalysis>("/admin/analysis/daily") });
  const reportsQuery = useQuery({
    queryKey: ["reports", reportPeriod, reportFrom, reportTo, reportSource, reportGroup],
    queryFn: () => api<ReportsData>(`/admin/reports?period=${reportPeriod}&source=${reportSource}&group=${reportGroup}${reportPeriod === "custom" && reportFrom ? `&from=${reportFrom}` : ""}${reportPeriod === "custom" && reportTo ? `&to=${reportTo}` : ""}`),
  });
  const fiscalQuery = useQuery({ queryKey: ["fiscal-readiness"], queryFn: () => api<FiscalReadiness>("/admin/fiscal/readiness") });
  const settingsQuery = useQuery({ queryKey: ["admin-settings"], queryFn: () => api<PosSettings>("/admin/settings") });
  const loyverseStatusQuery = useQuery({ queryKey: ["loyverse-status"], queryFn: () => api<LoyverseStatus>("/admin/loyverse/status"), enabled: tab === "loyverse" });
  const loyverseDashboardQuery = useQuery({ queryKey: ["loyverse-dashboard", loyverseStoreId, loyverseFrom, loyverseTo], queryFn: () => { const params = new URLSearchParams(); if (loyverseStoreId) params.set("storeId", loyverseStoreId); if (loyverseFrom) params.set("from", new Date(`${loyverseFrom}T00:00:00`).toISOString()); if (loyverseTo) params.set("to", new Date(`${loyverseTo}T23:59:59.999`).toISOString()); return api<LoyverseDashboard>(`/admin/loyverse/dashboard${params.toString() ? `?${params.toString()}` : ""}`); }, enabled: tab === "loyverse" });
  const fiscalVerifyMutation = useMutation({
    mutationFn: () => api<FiscalVerification>("/admin/fiscal/verify-chain"),
    onSuccess: (result) => result.valid ? toast.success(`Cadena fiscal válida · ${result.checkedRecords} registros comprobados`) : toast.error("La cadena fiscal tiene incidencias", { description: result.problems[0]?.message }),
    onError: (error) => toast.error("No se ha podido verificar la cadena", { description: error.message }),
  });
  const fiscalCancelMutation = useMutation({
    mutationFn: ({ fiscalInvoiceId, reason }: { fiscalInvoiceId: number; reason: string }) => api(`/admin/fiscal/invoices/${fiscalInvoiceId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => { toast.success("Registro de anulación creado en pruebas"); void fiscalQuery.refetch(); },
    onError: (error) => toast.error("No se pudo crear la anulación", { description: error.message }),
  });
  const fiscalRectifyMutation = useMutation({
    mutationFn: ({ fiscalInvoiceId, reason, correctedTotal }: { fiscalInvoiceId: number; reason: string; correctedTotal?: number }) => api(`/admin/fiscal/invoices/${fiscalInvoiceId}/rectify`, { method: "POST", body: JSON.stringify({ reason, correctedTotal }) }),
    onSuccess: () => { toast.success("Registro de rectificación creado en pruebas"); void fiscalQuery.refetch(); },
    onError: (error) => toast.error("No se pudo crear la rectificación", { description: error.message }),
  });
  const cashHistoryQuery = useQuery({ queryKey: ["cash-history"], queryFn: () => api<CashSessionRow[]>("/admin/cash-sessions") });
  const activeAdminCategories = useMemo(() => (categoriesQuery.data ?? []).filter((category) => category.isActive !== false), [categoriesQuery.data]);
  const activeAdminProducts = useMemo(() => (productsQuery.data ?? []).filter((product) => product.isActive !== false), [productsQuery.data]);
  const filteredAdminProducts = useMemo(() => {
    const soldByProduct = new Map((reportQuery.data ?? []).map((row) => [row.productId, Number(row.units)]));
    const rows = activeAdminProducts.filter((product) => productCategoryFilter === "all" || String(product.categoryId) === productCategoryFilter).filter((product) => {
      const stock = Number(product.stock);
      if (productStockFilter === "empty") return stock <= 0;
      if (productStockFilter === "low") return stock > 0 && stock <= Number(product.minimumStock);
      return true;
    });
    return [...rows].sort((a, b) => {
      if (productSort === "price") return Number(a.salePrice) - Number(b.salePrice);
      if (productSort === "stock") return Number(a.stock) - Number(b.stock);
      if (productSort === "cost") return Number(a.cost) - Number(b.cost);
      if (productSort === "family") return a.categoryName.localeCompare(b.categoryName, "es", { sensitivity: "base" }) || a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      if (productSort === "sold") return (soldByProduct.get(b.id) ?? 0) - (soldByProduct.get(a.id) ?? 0);
      return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    });
  }, [activeAdminProducts, reportQuery.data, productCategoryFilter, productStockFilter, productSort]);
  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;
    setSmtpForm((current) => ({ ...current, smtpHost: settings.smtpHost ?? "", smtpPort: String(settings.smtpPort ?? 587), smtpSecure: settings.smtpSecure, smtpUser: settings.smtpUser ?? "", smtpFrom: settings.smtpFrom ?? "", smtpPassword: "", clearPassword: false }));
    setLoyverseConfigForm((current) => ({ ...current, apiBaseUrl: settings.loyverseApiBaseUrl || "https://api.loyverse.com/v1.0", storeId: settings.loyverseStoreId ?? "", apiToken: "", clearToken: false }));
  }, [settingsQuery.data]);
  const updateSmtpMutation = useMutation({
    mutationFn: () => api<PosSettings>("/admin/settings/smtp", { method: "PATCH", body: JSON.stringify({ smtpHost: smtpForm.smtpHost || null, smtpPort: Number(smtpForm.smtpPort || 587), smtpSecure: smtpForm.smtpSecure, smtpUser: smtpForm.smtpUser || null, smtpPassword: smtpForm.smtpPassword || undefined, clearPassword: smtpForm.clearPassword, smtpFrom: smtpForm.smtpFrom || null }) }),
    onSuccess: (settings) => { setSmtpForm((current) => ({ ...current, smtpPassword: "", clearPassword: false })); queryClient.setQueryData(["admin-settings"], settings); queryClient.invalidateQueries({ queryKey: ["email-status"] }); toast.success("Configuración SMTP guardada"); },
    onError: (error) => toast.error("No se ha podido guardar el SMTP", { description: error.message }),
  });
  const testSmtpMutation = useMutation({
    mutationFn: () => api<{ success: boolean; message: string }>("/admin/settings/smtp/test", { method: "POST" }),
    onSuccess: (result) => toast.success(result.message),
    onError: (error) => toast.error("La prueba SMTP ha fallado", { description: error.message }),
  });
  const saveLoyverseSettingsMutation = useMutation({
    mutationFn: () => api<LoyverseSettings>("/admin/settings/loyverse", { method: "PATCH", body: JSON.stringify({ apiBaseUrl: loyverseConfigForm.apiBaseUrl, apiToken: loyverseConfigForm.apiToken || undefined, clearToken: loyverseConfigForm.clearToken, storeId: loyverseConfigForm.storeId || null }) }),
    onSuccess: async (settings) => { setLoyverseConfigForm((current) => ({ ...current, apiToken: "", clearToken: false })); queryClient.setQueryData(["admin-settings"], { ...settingsQuery.data, ...settings }); await queryClient.refetchQueries({ queryKey: ["loyverse-status"] }); await queryClient.invalidateQueries({ queryKey: ["loyverse-dashboard"] }); toast.success("Configuración de Loyverse guardada"); },
    onError: (error) => toast.error("No se ha podido guardar la configuración de Loyverse", { description: error.message }),
  });
  const testLoyverseMutation = useMutation({
    mutationFn: () => api<{ success: boolean; merchantName: string | null; apiBase: string }>("/admin/loyverse/test", { method: "POST" }),
    onSuccess: async (result) => { toast.success("Conexión con Loyverse correcta", { description: result.merchantName ? `Comercio: ${result.merchantName}` : result.apiBase }); await queryClient.refetchQueries({ queryKey: ["loyverse-status"] }); },
    onError: (error) => toast.error("No se ha podido conectar con Loyverse", { description: error.message }),
  });
  const syncLoyverseCatalogMutation = useMutation({
    mutationFn: () => api<{ success: boolean; items: number; categories: number; taxes?: number; variants?: number; inventoryLevels: number }>("/admin/loyverse/sync/catalog", { method: "POST" }),
    onSuccess: (result) => { toast.success("Catálogo de Loyverse sincronizado", { description: `${result.items} artículos · ${result.variants ?? 0} variantes · ${result.taxes ?? 0} impuestos · ${result.categories} familias · ${result.inventoryLevels} niveles de stock` }); queryClient.invalidateQueries({ queryKey: ["loyverse-status"] }); queryClient.invalidateQueries({ queryKey: ["loyverse-dashboard"] }); },
    onError: (error) => toast.error("No se ha podido sincronizar el catálogo de Loyverse", { description: error.message }),
  });
  const syncLoyverseSalesMutation = useMutation({
    mutationFn: () => syncSalesLast31Days(loyverseStoreId),
    onSuccess: (result) => { if (result.noData) toast.info("Loyverse no tiene recibos en la cuenta o tienda seleccionada"); else toast.success("Ventas de Loyverse importadas", { description: `${result.receipts} recibos · ${result.shifts} turnos · ${result.chunks} tramo${result.chunks === 1 ? "" : "s"}. Solo lectura.` }); queryClient.invalidateQueries({ queryKey: ["loyverse-status"] }); queryClient.invalidateQueries({ queryKey: ["loyverse-dashboard"] }); },
    onError: (error) => toast.error("No se han podido importar las ventas de Loyverse", { description: error.message }),
  });
  const syncLoyverseAllMutation = useMutation({
    mutationFn: async () => {
      const catalog = await api<{ success: boolean; items: number; categories: number; taxes?: number; variants?: number; inventoryLevels: number }>("/admin/loyverse/sync/catalog", { method: "POST" });
      const sales = await syncSalesLast31Days(loyverseStoreId);
      const imported = await api<{ productsCreated: number; productsUpdated: number; stockUpdated: number; costVariantsAvailable: number; costsUpdated: number; costsPreserved: number; taxesAvailable: number; productsWithRemoteVat: number; productsUsingVatFallback: number }>("/admin/loyverse/import/catalog", { method: "POST", body: JSON.stringify({ storeId: loyverseStoreId || undefined }) });
      return { ...catalog, ...sales, imported };
    },
    onSuccess: (result) => { toast.success("Loyverse sincronizado e importado al TPV", { description: `${result.items} artículos · ${result.receipts} recibos · ${result.imported.productsUpdated + result.imported.productsCreated} artículos aplicados · ${result.imported.costsUpdated} costes guardados · ${result.imported.productsWithRemoteVat} IVA de Loyverse · ${result.imported.productsUsingVatFallback} IVA de fallback` }); queryClient.invalidateQueries({ queryKey: ["loyverse-status"] }); queryClient.invalidateQueries({ queryKey: ["loyverse-dashboard"] }); queryClient.invalidateQueries({ queryKey: ["admin-products"] }); queryClient.invalidateQueries({ queryKey: ["admin-inventory"] }); queryClient.invalidateQueries({ queryKey: ["catalog"] }); },
    onError: (error) => toast.error("No se ha podido sincronizar e importar Loyverse", { description: error.message }),
  });
  const importLoyverseCatalogMutation = useMutation({
    mutationFn: () => api<{ success: boolean; categoriesCreated: number; categoriesUpdated: number; productsCreated: number; productsUpdated: number; stockUpdated: number; costVariantsAvailable: number; costsUpdated: number; costsPreserved: number; taxesAvailable: number; productsWithRemoteVat: number; productsUsingVatFallback: number; skipped: number; skippedDetails: string[] }>("/admin/loyverse/import/catalog", { method: "POST", body: JSON.stringify({ storeId: loyverseStoreId || undefined }) }),
    onSuccess: (result) => { toast.success("Catálogo importado al TPV", { description: `${result.productsCreated} nuevos · ${result.productsUpdated} actualizados · ${result.stockUpdated} stocks sincronizados · ${result.costsUpdated} costes guardados · ${result.costsPreserved} costes locales conservados · ${result.productsWithRemoteVat} IVA de Loyverse · ${result.productsUsingVatFallback} IVA de fallback${result.costVariantsAvailable === 0 ? " · Loyverse no entregó costes" : ""}${result.taxesAvailable === 0 ? " · Sin impuestos descargados" : ""}${result.skipped ? ` · ${result.skipped} omitidos por conflicto` : ""}` }); queryClient.invalidateQueries({ queryKey: ["admin-products"] }); queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); queryClient.invalidateQueries({ queryKey: ["admin-inventory"] }); queryClient.invalidateQueries({ queryKey: ["catalog"] }); queryClient.invalidateQueries({ queryKey: ["loyverse-dashboard"] }); },
    onError: (error) => toast.error("No se ha podido importar el catálogo al TPV", { description: error.message }),
  });
  const createVatTypeMutation = useMutation({
    mutationFn: () => { const rate = Number(vatTypeForm.rate.replace(",", ".")); if (!vatTypeForm.name.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("Introduce un nombre y un porcentaje de IVA válido."); return api<{ id: number }>("/admin/vat-types", { method: "POST", body: JSON.stringify({ name: vatTypeForm.name.trim(), rate }) }); },
    onSuccess: () => { setVatTypeForm({ name: "", rate: "" }); toast.success("Tipo de IVA creado"); queryClient.invalidateQueries({ queryKey: ["admin-vat-types"] }); },
    onError: (error) => toast.error("No se ha podido crear el tipo de IVA", { description: error.message }),
  });
  const restoreCategoriesMutation = useMutation({
    mutationFn: () => api<{ restoredCategories: number; reassignedProducts: number }>("/admin/categories/restore-local", { method: "POST" }),
    onSuccess: (result) => { toast.success("Familias locales restauradas", { description: `${result.restoredCategories} familias activadas · ${result.reassignedProducts} artículos reasignados` }); queryClient.invalidateQueries({ queryKey: ["admin-products"] }); queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); queryClient.invalidateQueries({ queryKey: ["catalog"] }); },
    onError: (error) => toast.error("No se han podido restaurar las familias", { description: error.message }),
  });
  const repairVatMutation = useMutation({
    mutationFn: () => api<{ success: boolean; corrected: number; vatRate: number; historicalRecordsChanged: boolean }>("/admin/products/repair-vat", { method: "POST" }),
    onSuccess: (result) => { toast.success(result.corrected ? `IVA corregido en ${result.corrected} artículos importados` : "No había artículos importados con IVA 7 %"); invalidateAdmin(); queryClient.invalidateQueries({ queryKey: ["catalog"] }); queryClient.invalidateQueries({ queryKey: ["featured"] }); },
    onError: (error) => toast.error("No se ha podido corregir el IVA importado", { description: error.message }),
  });
  const saleDetailsQuery = useQuery({ queryKey: ["sale-details", selectedSaleId], queryFn: () => api<SaleDetails>(`/sales/${selectedSaleId}`), enabled: selectedSaleId !== null });
  const updateCashMutation = useMutation({
    mutationFn: (input: { id: number; countedCash: number; countedCard: number; notes: string }) => api(`/admin/cash-sessions/${input.id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => { toast.success("Arqueo actualizado"); setEditingCashId(null); queryClient.invalidateQueries({ queryKey: ["cash-history"] }); queryClient.invalidateQueries({ queryKey: ["cash"] }); },
    onError: (error) => toast.error("No se ha podido editar el arqueo", { description: error.message }),
  });

  const invalidateAdmin = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    queryClient.invalidateQueries({ queryKey: ["admin-promotions"] });
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
    mutationFn: () => api<{ id: number }>("/admin/categories", { method: "POST", body: JSON.stringify({ ...categoryForm, parentCategoryId: categoryForm.parentCategoryId ? Number(categoryForm.parentCategoryId) : null, imageUrl: categoryImageUrl || undefined }) }),
    onSuccess: () => { toast.success("Familia creada"); setCategoryForm({ name: "", parentCategoryId: "", color: "#4C8A5A", iconName: "Folder", isPromotion: false }); setCategoryImageUrl(null); setCategoryFormOpen(false); queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); queryClient.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (error) => toast.error("No se ha podido crear la familia", { description: error.message }),
  });
  const updateCategoryMutation = useMutation({
    mutationFn: () => api<{ success: boolean }>(`/admin/categories/${editingCategoryId}`, { method: "PATCH", body: JSON.stringify({ ...categoryForm, parentCategoryId: categoryForm.parentCategoryId ? Number(categoryForm.parentCategoryId) : null, imageUrl: categoryImageUrl }) }),
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
    mutationFn: () => { const salePrice = Number(productForm.salePrice.replace(",", ".")); if (!Number.isFinite(salePrice) || salePrice < 0) throw new Error("El precio de venta debe ser un número válido."); return api<{ id: number }>("/products", { method: "POST", body: JSON.stringify({ categoryId: Number(productForm.categoryId), name: productForm.name.trim(), salePrice, vatTypeId: productForm.vatTypeId ? Number(productForm.vatTypeId) : undefined, vatRate: Number(productForm.vatRate), barcode: productForm.barcode || undefined, minimumStock: Number(productForm.minimumStock || 0), initialStock: Number(productForm.initialStock || 0), imageUrl: productImageUrl || undefined, imageZoom: productForm.imageZoom, imagePositionX: productForm.imagePositionX, imagePositionY: productForm.imagePositionY }) }); },
    onSuccess: () => { setProductForm({ name: "", salePrice: "", initialStock: "", categoryId: "", vatTypeId: vatTypesQuery.data?.[0] ? String(vatTypesQuery.data[0].id) : "", vatRate: "10", barcode: "", minimumStock: "0", imageZoom: 1, imagePositionX: 50, imagePositionY: 50 }); setProductImageUrl(null); setProductFormOpen(false); toast.success("Producto añadido al catálogo"); invalidateAdmin(); queryClient.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (error) => toast.error("No se ha podido crear el producto", { description: error.message }),
  });
  const updateProductMutation = useMutation({
    mutationFn: () => api<{ success: boolean }>(`/admin/products/${editingProductId}`, { method: "PATCH", body: JSON.stringify({ categoryId: Number(productForm.categoryId), name: productForm.name, salePrice: Number(productForm.salePrice), vatTypeId: productForm.vatTypeId ? Number(productForm.vatTypeId) : null, vatRate: Number(productForm.vatRate), barcode: productForm.barcode || null, minimumStock: Number(productForm.minimumStock || 0), imageUrl: productImageUrl, imageZoom: productForm.imageZoom, imagePositionX: productForm.imagePositionX, imagePositionY: productForm.imagePositionY }) }),
    onSuccess: () => { setEditingProductId(null); setProductFormOpen(false); setProductImageUrl(null); toast.success("Artículo actualizado"); invalidateAdmin(); },
    onError: (error) => toast.error("No se ha podido actualizar el artículo", { description: error.message }),
  });
  const quickUpdateProductMutation = useMutation({
    mutationFn: (input: { id: number; patch: QuickProductPatch }) => api<{ success: boolean }>(`/admin/products/${input.id}`, { method: "PATCH", body: JSON.stringify(input.patch) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-products"] }); queryClient.invalidateQueries({ queryKey: ["catalog"] }); queryClient.invalidateQueries({ queryKey: ["featured"] }); },
    onError: (error) => toast.error("No se ha podido guardar el cambio rápido", { description: error.message }),
  });
  const toggleProductTpvMutation = useMutation({
    mutationFn: (input: { id: number; showInTpv: boolean }) => api<{ success: boolean }>(`/admin/products/${input.id}`, { method: "PATCH", body: JSON.stringify({ showInTpv: input.showInTpv }) }),
    onSuccess: (_result, input) => { toast.success(input.showInTpv ? "Artículo visible en el TPV" : "Artículo oculto del TPV"); invalidateAdmin(); queryClient.invalidateQueries({ queryKey: ["catalog"] }); queryClient.invalidateQueries({ queryKey: ["featured"] }); },
    onError: (error) => toast.error("No se ha podido cambiar la visibilidad", { description: error.message }),
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
  const editProduct = (product: AdminProduct) => { setEditingProductId(product.id); setProductForm({ name: product.name, salePrice: product.salePrice, initialStock: product.stock, categoryId: String(product.categoryId), vatTypeId: product.vatTypeId ? String(product.vatTypeId) : (vatTypesQuery.data?.find((vatType) => Number(vatType.rate) === Number(product.vatRate))?.id ? String(vatTypesQuery.data.find((vatType) => Number(vatType.rate) === Number(product.vatRate))?.id) : ""), vatRate: product.vatRate, barcode: product.barcode ?? "", minimumStock: product.minimumStock, imageZoom: Number(product.imageZoom ?? 1), imagePositionX: Number(product.imagePositionX ?? 50), imagePositionY: Number(product.imagePositionY ?? 50) }); setProductImageUrl(product.imageUrl); setProductFormOpen(true); setTab("products"); };
  const createSupplierMutation = useMutation({
    mutationFn: () => api<{ id: number }>("/admin/suppliers", { method: "POST", body: JSON.stringify({ name: supplierForm.name, legalName: supplierForm.legalName, taxId: supplierForm.taxId, phone: supplierForm.phone }) }),
    onSuccess: () => { setSupplierForm({ name: "", legalName: "", taxId: "", phone: "", email: "" }); setSupplierFormOpen(false); toast.success("Proveedor añadido"); invalidateAdmin(); },
    onError: (error) => toast.error("No se ha podido crear el proveedor", { description: error.message }),
  });
  const updateSupplierMutation = useMutation({
    mutationFn: () => api<{ success: boolean }>(`/admin/suppliers/${editingSupplierId}`, { method: "PATCH", body: JSON.stringify({ name: supplierForm.name, legalName: supplierForm.legalName || null, taxId: supplierForm.taxId || null, phone: supplierForm.phone || null, email: supplierForm.email || null }) }),
    onSuccess: () => { setSupplierForm({ name: "", legalName: "", taxId: "", phone: "", email: "" }); setEditingSupplierId(null); setSupplierFormOpen(false); toast.success("Proveedor actualizado"); invalidateAdmin(); },
    onError: (error) => toast.error("No se ha podido actualizar el proveedor", { description: error.message }),
  });
  const deactivateSupplierMutation = useMutation({
    mutationFn: (id: number) => api<{ success: boolean }>(`/admin/suppliers/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Proveedor retirado"); invalidateAdmin(); },
    onError: (error) => toast.error("No se ha podido retirar el proveedor", { description: error.message }),
  });
  const createPromotionMutation = useMutation({
    mutationFn: (input: { productId: number; name: string; comboPrice: number; slots: Array<{ label: string; categoryId: number; productIds: number[] }> }) => api<{ id: number; replaced?: boolean }>("/admin/promotions", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (result) => { toast.success(result.replaced ? "Promoción actualizada" : "Promoción guardada"); setPromotionFormOpen(false); setPromotionForm({ productId: "", name: "", comboPrice: "", slots: [{ label: "", categoryId: "", productIds: [] }] }); invalidateAdmin(); },
    onError: (error) => toast.error("No se ha podido guardar la promoción", { description: error.message }),
  });
  const deactivatePromotionMutation = useMutation({
    mutationFn: (id: number) => api<{ success: boolean }>(`/admin/promotions/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Promoción retirada"); invalidateAdmin(); },
    onError: (error) => toast.error("No se ha podido retirar la promoción", { description: error.message }),
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
  const lowStock = activeAdminProducts.filter((product) => Number(product.stock) <= Number(product.minimumStock));
  const topProducts = reportQuery.data?.slice(0, 5) ?? [];

  const tabs: Array<{ id: AdminTab; label: string; icon: typeof LayoutGrid }> = [
    { id: "analysis", label: "Análisis diario", icon: CalendarDays },
    { id: "reports", label: "Informes", icon: BarChart3 },
    { id: "fiscal", label: "Fiscal (pruebas)", icon: ReceiptText },
    { id: "overview", label: "Resumen", icon: ChartNoAxesCombined },
    { id: "categories", label: "Familias", icon: Folder },
    { id: "promotions", label: "Promociones", icon: ReceiptText },
    { id: "products", label: "Productos", icon: PackageOpen },
    { id: "inventory", label: "Stock", icon: ShoppingBag },
    { id: "suppliers", label: "Proveedores", icon: UsersRound },
    { id: "purchases", label: "Compras y facturas", icon: ReceiptText },
    { id: "sales", label: "Ventas", icon: Barcode },
    { id: "cash", label: "Caja", icon: Banknote },
    { id: "loyverse", label: "Loyverse", icon: Link2 },
    { id: "settings", label: "Configuración", icon: Settings },
  ];

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand"><span className="brand-mark">S/S</span><div><strong>Sweet &amp; Salty</strong><small>Administración</small></div></div>
        <nav className="admin-nav">{tabs.map(({ id, label, icon: Icon }) => <button key={id} title={label} className={tab === id ? "admin-nav__item admin-nav__item--active" : "admin-nav__item"} onClick={() => setTab(id)}><Icon size={19} strokeWidth={1.8} /><span>{label}</span>{id === "inventory" && lowStock.length > 0 && <b>{lowStock.length}</b>}</button>)}</nav>
        <div className="admin-sidebar__footer"><small>Versión v0.1.0 · 2026</small><button onClick={onBack}><ShoppingBag size={16} /> Volver al TPV</button></div>
      </aside>
      <section className="admin-content">
        <header className="admin-topbar"><button className="admin-mobile-menu" onClick={onOpenMenu} aria-label="Abrir menú principal"><Menu size={25} /></button><div><span className="eyebrow">PANEL DE CONTROL</span><h1>{tabs.find((item) => item.id === tab)?.label}</h1><small className="build-label">{buildLabel}</small></div><div className="admin-topbar__actions"><span className="register-status"><i /> Caja {cashQuery.data?.status === "closed" ? "cerrada" : "abierta"}</span><button className="avatar">SS</button></div></header>
        {tab === "reports" && <ReportsPanel data={reportsQuery.data} period={reportPeriod} setPeriod={setReportPeriod} from={reportFrom} setFrom={setReportFrom} to={reportTo} setTo={setReportTo} source={reportSource} setSource={setReportSource} group={reportGroup} setGroup={setReportGroup} metric={reportMetric} setMetric={setReportMetric} isLoading={reportsQuery.isLoading} />}
        {tab === "fiscal" && <FiscalReadinessPanel data={fiscalQuery.data} loading={fiscalQuery.isLoading} verifying={fiscalVerifyMutation.isPending} onVerify={() => fiscalVerifyMutation.mutate()} onCancel={(fiscalInvoiceId) => { const reason = window.prompt("Motivo de anulación"); if (reason?.trim()) fiscalCancelMutation.mutate({ fiscalInvoiceId, reason }); }} onRectify={(fiscalInvoiceId, totalAmount) => { const reason = window.prompt("Motivo de rectificación"); if (reason?.trim()) fiscalRectifyMutation.mutate({ fiscalInvoiceId, reason, correctedTotal: totalAmount }); }} correcting={fiscalCancelMutation.isPending || fiscalRectifyMutation.isPending} />}
        {tab === "analysis" && <div className="admin-page analysis-page"><AdminPageHeader title="Análisis diario" description={`Jornada comercial ${analysisQuery.data?.businessDate ?? cashQuery.data?.businessDate ?? "—"} · de 07:00 a 07:00 · ${cashQuery.data?.businessTimezone ?? "Europe/Madrid"}`} /><div className="metric-grid"><div className="metric-card metric-card--accent"><span>Total vendido hoy</span><strong>{euro.format(Number(analysisQuery.data?.totalSold ?? cashQuery.data?.totalSold ?? 0))}</strong><small>{analysisQuery.data?.tickets ?? 0} tickets completados</small></div><div className="metric-card"><span>Efectivo</span><strong>{euro.format(Number(analysisQuery.data?.cashSold ?? 0))}</strong><small>Esperado en caja: {euro.format(Number(analysisQuery.data?.expectedCash ?? 0))}</small></div><div className="metric-card"><span>Tarjeta</span><strong>{euro.format(Number(analysisQuery.data?.cardSold ?? cashQuery.data?.cardTotal ?? 0))}</strong><small>Registrado en datáfono</small></div><div className="metric-card metric-card--warning"><span>Estado de caja</span><strong>{analysisQuery.data?.status === "closed" ? "Cerrada" : "Abierta"}</strong><small>Jornada activa</small></div></div><div className="admin-columns"><section className="admin-card hourly-chart-card"><div className="admin-card__header"><div><span className="eyebrow">RITMO DE VENTAS</span><h2>Ventas por hora</h2></div><span className="chart-caption">Hora española</span></div><div className="hourly-chart">{(analysisQuery.data?.hourly ?? []).map((bucket) => { const max = Math.max(...(analysisQuery.data?.hourly ?? []).map((item) => Number(item.total)), 1); const height = Math.max(4, (Number(bucket.total) / max) * 100); return <div className="hourly-chart__column" key={bucket.hour} title={`${bucket.label}: ${euro.format(Number(bucket.total))}`}><span className="hourly-chart__value">{Number(bucket.total) > 0 ? euro.format(Number(bucket.total)) : ""}</span><div className="hourly-chart__bar" style={{ height: `${height}%` }} /><small>{bucket.label}</small></div>; })}</div></section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">ARTÍCULOS</span><h2>Más vendidos hoy</h2></div></div>{(analysisQuery.data?.topProducts ?? []).length === 0 ? <div className="admin-empty">Todavía no hay ventas en esta jornada.</div> : <div className="mini-ranking">{analysisQuery.data?.topProducts.map((product, index) => <div className="mini-ranking__row" key={`${product.productId}-${product.productName}`}><b>{String(index + 1).padStart(2, "0")}</b><span>{product.productName}</span><small>{product.units} ud.</small><strong>{euro.format(Number(product.revenue))}</strong></div>)}</div>}</section></div></div>}
        {tab === "settings" && <VatSettingsPanel vatTypes={vatTypesQuery.data ?? []} form={vatTypeForm} setForm={setVatTypeForm} onCreate={() => createVatTypeMutation.mutate()} isPending={createVatTypeMutation.isPending} onRepairVat={() => { if (window.confirm("Se cambiará únicamente el IVA 7 % de productos importados de Loyverse al tipo de IVA predeterminado. No se tocarán ventas, tickets ni registros fiscales. ¿Continuar?")) repairVatMutation.mutate(); }} repairVatPending={repairVatMutation.isPending} smtpForm={smtpForm} setSmtpForm={setSmtpForm} settings={settingsQuery.data} smtpSaving={updateSmtpMutation.isPending} smtpTesting={testSmtpMutation.isPending} onSaveSmtp={() => updateSmtpMutation.mutate()} onTestSmtp={() => testSmtpMutation.mutate()} />}
        {tab === "loyverse" && <LoyversePanel status={loyverseStatusQuery.data} settings={settingsQuery.data} dashboard={loyverseDashboardQuery.data} loading={loyverseDashboardQuery.isLoading || loyverseStatusQuery.isLoading} configForm={loyverseConfigForm} setConfigForm={setLoyverseConfigForm} savingConfig={saveLoyverseSettingsMutation.isPending} onSaveConfig={() => saveLoyverseSettingsMutation.mutate()} testingConnection={testLoyverseMutation.isPending} onTestConnection={() => testLoyverseMutation.mutate()} restoringCategories={restoreCategoriesMutation.isPending} onRestoreCategories={() => { if (window.confirm("Se reactivarán las antiguas familias del catálogo y se reasignarán los artículos usando la relación histórica local. No se importarán ni modificarán familias de Loyverse. ¿Continuar?")) restoreCategoriesMutation.mutate(); }} importingCatalog={importLoyverseCatalogMutation.isPending} onImportCatalog={() => { if (window.confirm("Se actualizarán artículos, precios, imágenes, stock, impuestos y costes desde Loyverse, incluyendo las ventas recientes para obtener costes de respaldo, antes de importarlos al TPV. Las familias y subfamilias locales no se modificarán. No se modificarán ventas ni caja. ¿Continuar?")) syncLoyverseCatalogMutation.mutateAsync().then(() => syncLoyverseSalesMutation.mutateAsync()).then(() => importLoyverseCatalogMutation.mutate()).catch(() => undefined); }} storeId={loyverseStoreId} setStoreId={setLoyverseStoreId} from={loyverseFrom} setFrom={(value) => setLoyverseFrom(value)} to={loyverseTo} setTo={(value) => setLoyverseTo(value)} syncingCatalog={syncLoyverseCatalogMutation.isPending} syncingSales={syncLoyverseSalesMutation.isPending} syncingAll={syncLoyverseAllMutation.isPending} onSyncCatalog={() => syncLoyverseCatalogMutation.mutate()} onSyncSales={() => syncLoyverseSalesMutation.mutate()} onSyncAll={() => syncLoyverseAllMutation.mutate()} />}
        {tab === "overview" && <div className="admin-page"><div className="metric-grid"><div className="metric-card"><span>Ventas registradas</span><strong>{euro.format(totalSales)}</strong><small>En la consulta actual</small></div><div className="metric-card"><span>Tickets</span><strong>{salesQuery.data?.length ?? 0}</strong><small>Últimos 100 movimientos</small></div><div className="metric-card metric-card--warning"><span>Stock bajo</span><strong>{lowStock.length}</strong><small>Revisar entradas o ajustes</small></div><div className="metric-card metric-card--accent"><span>Tarjeta hoy</span><strong>{euro.format(Number(cashQuery.data?.cardTotal ?? 0))}</strong><small>Registrado en caja</small></div></div><div className="admin-columns"><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">PRODUCTOS</span><h2>Más vendidos</h2></div><button className="text-button" onClick={() => setTab("sales")}>Ver informe</button></div>{topProducts.length === 0 ? <div className="admin-empty">Aún no hay ventas de artículos.</div> : <div className="mini-ranking">{topProducts.map((product, index) => <div className="mini-ranking__row" key={`${product.productId}-${product.productName}`}><b>{String(index + 1).padStart(2, "0")}</b><span>{product.productName}</span><small>{product.units} ud.</small><strong>{euro.format(Number(product.revenue))}</strong></div>)}</div>}</section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">OPERACIÓN</span><h2>Acciones rápidas</h2></div></div><div className="quick-actions"><button onClick={() => { setTab("products"); setProductFormOpen(true); }}><Plus size={17} /><span>Añadir producto</span></button><button onClick={() => { setTab("inventory"); }}><PackageOpen size={17} /><span>Ajustar stock</span></button><button onClick={() => { setTab("purchases"); }}><ReceiptText size={17} /><span>Registrar factura</span></button><button onClick={() => { setTab("cash"); }}><Banknote size={17} /><span>Revisar caja</span></button></div></section></div><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">ACTIVIDAD</span><h2>Últimos tickets</h2></div><button className="text-button" onClick={() => setTab("sales")}>Ver todos</button></div><SalesTable sales={salesQuery.data?.slice(0, 6) ?? []} /></section></div>}
        {tab === "promotions" && <PromotionManager categories={activeAdminCategories} products={activeAdminProducts} promotions={promotionsQuery.data ?? []} formOpen={promotionFormOpen} form={promotionForm} setForm={setPromotionForm} onOpenCreate={() => { setPromotionForm({ productId: "", name: "", comboPrice: "", slots: [{ label: "", categoryId: "", productIds: [] }] }); setPromotionFormOpen(true); }} onClose={() => setPromotionFormOpen(false)} saving={createPromotionMutation.isPending} onSave={() => createPromotionMutation.mutate({ productId: Number(promotionForm.productId), name: promotionForm.name, comboPrice: Number(promotionForm.comboPrice), slots: promotionForm.slots.map((slot) => ({ label: slot.label, categoryId: Number(slot.categoryId), productIds: slot.productIds })) })} onDeactivate={(id) => deactivatePromotionMutation.mutate(id)} />}
        {tab === "categories" && <CategoryManager categories={activeAdminCategories} formOpen={categoryFormOpen} editingId={editingCategoryId} form={categoryForm} imageUrl={categoryImageUrl} isSaving={createCategoryMutation.isPending || updateCategoryMutation.isPending} imageLoading={categoryImageMutation.isPending} onOpenCreate={() => { setEditingCategoryId(null); setCategoryForm({ name: "", parentCategoryId: "", color: "#4C8A5A", iconName: "Folder", isPromotion: false }); setCategoryImageUrl(null); setCategoryFormOpen(true); }} onClose={() => { setCategoryFormOpen(false); setEditingCategoryId(null); setCategoryImageUrl(null); }} onFormChange={setCategoryForm} onImage={(file) => categoryImageMutation.mutate(file)} onRemoveImage={() => setCategoryImageUrl(null)} onSave={() => { if (editingCategoryId) updateCategoryMutation.mutate(); else createCategoryMutation.mutate(); }} onEdit={(category) => { setEditingCategoryId(category.id); setCategoryForm({ name: category.name, parentCategoryId: category.parentCategoryId ? String(category.parentCategoryId) : "", color: category.color, iconName: category.iconName || "Folder", isPromotion: category.isPromotion === true }); setCategoryImageUrl(category.imageUrl); setCategoryFormOpen(true); }} onMove={(category, direction) => { const current = [...(categoriesQuery.data ?? [])]; const from = current.findIndex((item) => item.id === category.id); const target = from + direction; if (target < 0 || target >= current.length) return; [current[from], current[target]] = [current[target], current[from]]; reorderCategoriesMutation.mutate(current.map((item, index) => ({ id: item.id, sortOrder: index }))); }} onDeactivate={(category) => { if (window.confirm(`¿Retirar la familia ${category.name} del TPV? Los productos deben reasignarse antes.`)) deactivateCategoryMutation.mutate(category.id); }} />}
        {tab === "products" && <div className="admin-page"><AdminPageHeader title="Catálogo de venta" description="Gestiona nombre, precio, IVA, código de barras, imagen y stock mínimo." actionLabel="Nuevo producto" onAction={() => { setEditingProductId(null); setProductImageUrl(null); setProductForm({ name: "", salePrice: "", initialStock: "", categoryId: "", vatTypeId: vatTypesQuery.data?.[0] ? String(vatTypesQuery.data[0].id) : "", vatRate: "10", barcode: "", minimumStock: "0", imageZoom: 1, imagePositionX: 50, imagePositionY: 50 }); setProductFormOpen(true); }} />{productFormOpen && <div className="inline-form context-edit-form"><div className="form-row"><label>Nombre<input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} placeholder="Ej. Café con leche" /></label><label>Familia<select value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })}><option value="">Selecciona…</option>{activeAdminCategories.map((category) => <option key={category.id} value={category.id}>{category.parentCategoryId ? `↳ ${activeAdminCategories.find((parent) => parent.id === category.parentCategoryId)?.name ?? ""} · ${category.name}` : category.name}</option>)}</select></label></div><div className="form-row"><label>Precio de venta<input type="number" min="0" step="0.01" inputMode="decimal" value={productForm.salePrice} onChange={(event) => setProductForm({ ...productForm, salePrice: event.target.value })} placeholder="0,00" /></label><label>Tipo de IVA<select value={productForm.vatTypeId} onChange={(event) => { const selected = vatTypesQuery.data?.find((vatType) => vatType.id === Number(event.target.value)); setProductForm({ ...productForm, vatTypeId: event.target.value, vatRate: selected?.rate ?? productForm.vatRate }); }}><option value="">Selecciona un tipo…</option>{vatTypesQuery.data?.map((vatType) => <option key={vatType.id} value={vatType.id}>{vatType.name} · {vatType.rate}%</option>)}</select></label></div><div className="form-row"><label>Código de barras<input value={productForm.barcode} onChange={(event) => setProductForm({ ...productForm, barcode: event.target.value })} placeholder="Escanea o escribe" /></label><label>Stock inicial<input inputMode="decimal" value={productForm.initialStock} onChange={(event) => setProductForm({ ...productForm, initialStock: event.target.value })} placeholder="0" /></label></div><div className="form-row"><label>Stock mínimo<input inputMode="decimal" value={productForm.minimumStock} onChange={(event) => setProductForm({ ...productForm, minimumStock: event.target.value })} placeholder="0" /></label></div><label className="image-upload-field">Foto del producto <small>{productImageUrl ? "Imagen cargada" : "Opcional"}</small><input type="file" accept="image/jpeg,image/png,image/webp" disabled={productImageMutation.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) productImageMutation.mutate(file); event.currentTarget.value = ""; }} /></label><div className={productImageUrl ? "image-preview image-preview--has-image" : "image-preview"}>{productImageUrl ? <><div className="product-image-editor-preview"><img src={productImageUrl} alt={`Vista previa de ${productForm.name || "producto"}`} style={{ objectPosition: `${productForm.imagePositionX}% ${productForm.imagePositionY}%`, transform: `scale(${productForm.imageZoom})` }} /></div><button type="button" className="image-remove-button" onClick={() => setProductImageUrl(null)} aria-label="Quitar imagen del producto" title="Quitar imagen"><X size={15} /></button></> : <><ImagePlus size={20} /><span>Sin imagen asignada</span></>}</div>{productImageUrl && <div className="image-crop-controls"><label>Zoom <input type="range" min="0.5" max="3" step="0.05" value={productForm.imageZoom} onChange={(event) => setProductForm({ ...productForm, imageZoom: Number(event.target.value) })} /><strong>{productForm.imageZoom.toFixed(2)}×</strong></label><label>Horizontal <input type="range" min="0" max="100" step="1" value={productForm.imagePositionX} onChange={(event) => setProductForm({ ...productForm, imagePositionX: Number(event.target.value) })} /><strong>{productForm.imagePositionX}%</strong></label><label>Vertical <input type="range" min="0" max="100" step="1" value={productForm.imagePositionY} onChange={(event) => setProductForm({ ...productForm, imagePositionY: Number(event.target.value) })} /><strong>{productForm.imagePositionY}%</strong></label><button type="button" className="text-button" onClick={() => setProductForm({ ...productForm, imageZoom: 1, imagePositionX: 50, imagePositionY: 50 })}>Restablecer encuadre</button></div>}<div className="inline-form__actions"><button className="secondary-button" onClick={() => setProductFormOpen(false)}>Cancelar</button><button className="primary-button" disabled={createProductMutation.isPending || updateProductMutation.isPending || !productForm.name || !productForm.categoryId || !productForm.salePrice} onClick={saveProduct}>{createProductMutation.isPending || updateProductMutation.isPending ? "Guardando…" : editingProductId ? "Guardar cambios" : "Guardar producto"}</button></div></div>}<ProductFilters categories={activeAdminCategories} category={productCategoryFilter} onCategory={setProductCategoryFilter} stock={productStockFilter} onStock={setProductStockFilter} sort={productSort} onSort={setProductSort} /><div className="admin-card admin-table-card"><AdminProductsTable products={filteredAdminProducts} categories={activeAdminCategories} vatTypes={vatTypesQuery.data ?? []} onEdit={editProduct} onQuickUpdate={(id, patch) => quickUpdateProductMutation.mutate({ id, patch })} onToggleTpv={(product) => toggleProductTpvMutation.mutate({ id: product.id, showInTpv: product.showInTpv === false })} onDeactivate={(productId) => { if (window.confirm("¿Retirar este artículo de la venta? Su historial se conservará.")) deactivateProductMutation.mutate(productId); }} /></div></div>}
        {tab === "inventory" && <div className="admin-page"><AdminPageHeader title="Control de stock" description="Filtra por familia, stock bajo o sin stock y ordena el listado según necesites." /><ProductFilters categories={activeAdminCategories} category={productCategoryFilter} onCategory={setProductCategoryFilter} stock={productStockFilter} onStock={setProductStockFilter} sort={productSort} onSort={setProductSort} /><div className="admin-card admin-table-card"><InventoryTable products={filteredAdminProducts} onAdjust={(productId, newQuantity) => adjustMutation.mutate({ productId, newQuantity })} /></div></div>}
        {tab === "suppliers" && <div className="admin-page"><AdminPageHeader title="Proveedores" description="Directorio independiente para compras y reconocimiento de facturas." actionLabel="Nuevo proveedor" onAction={() => { setEditingSupplierId(null); setSupplierForm({ name: "", legalName: "", taxId: "", phone: "", email: "" }); setSupplierFormOpen(true); }} />{supplierFormOpen && <div className="inline-form"><div className="form-row"><label>Nombre comercial<input value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} placeholder="Proveedor" /></label><label>Razón social<input value={supplierForm.legalName} onChange={(event) => setSupplierForm({ ...supplierForm, legalName: event.target.value })} placeholder="Opcional" /></label></div><div className="form-row"><label>NIF/CIF<input value={supplierForm.taxId} onChange={(event) => setSupplierForm({ ...supplierForm, taxId: event.target.value })} placeholder="Opcional" /></label><label>Teléfono<input value={supplierForm.phone} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} placeholder="Opcional" /></label></div><div className="inline-form__actions"><button className="secondary-button" onClick={() => setSupplierFormOpen(false)}>Cancelar</button><button className="primary-button" disabled={createSupplierMutation.isPending || !supplierForm.name} onClick={() => { if (editingSupplierId) updateSupplierMutation.mutate(); else createSupplierMutation.mutate(); }}>{createSupplierMutation.isPending || updateSupplierMutation.isPending ? "Guardando…" : editingSupplierId ? "Guardar cambios" : "Guardar proveedor"}</button></div></div>}<div className="admin-card admin-table-card"><SupplierTable suppliers={suppliersQuery.data ?? []} onEdit={(supplier) => { setEditingSupplierId(supplier.id); setSupplierForm({ name: supplier.name, legalName: supplier.legalName ?? "", taxId: supplier.taxId ?? "", phone: supplier.phone ?? "", email: supplier.email ?? "" }); setSupplierFormOpen(true); }} onDeactivate={(id) => { if (window.confirm("¿Retirar este proveedor? Sus facturas históricas se conservarán.")) deactivateSupplierMutation.mutate(id); }} /></div></div>}
        {tab === "purchases" && <div className="admin-page"><AdminPageHeader title="Compras y facturas" description="Las facturas se guardarán como borradores hasta revisar el OCR y confirmar sus líneas." actionLabel="Nueva factura manual" onAction={() => setManualInvoiceNewOpen(true)} />{manualInvoiceNewOpen && <ManualInvoiceForm suppliers={suppliersQuery.data ?? []} products={activeAdminProducts} onClose={() => setManualInvoiceNewOpen(false)} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["admin-purchase-invoices"] }); invalidateAdmin(); }} />}{manualInvoiceOpen && <div className="admin-card manual-invoice-card"><div className="admin-card__header"><div><span className="eyebrow">REGISTRO MANUAL</span><h2>Añadir factura</h2></div><button className="icon-button" onClick={() => setManualInvoiceOpen(false)}><X size={17} /></button></div><div className="form-row"><label>Proveedor<select value={manualInvoiceForm.supplierId} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, supplierId: event.target.value })}><option value="">Sin asignar</option>{suppliersQuery.data?.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Número de factura<input value={manualInvoiceForm.invoiceNumber} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, invoiceNumber: event.target.value })} /></label><label>Fecha<input type="date" value={manualInvoiceForm.invoiceDate} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, invoiceDate: event.target.value })} /></label></div><div className="form-row"><label>Subtotal<input inputMode="decimal" value={manualInvoiceForm.subtotal} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, subtotal: event.target.value })} /></label><label>IVA<input inputMode="decimal" value={manualInvoiceForm.vatAmount} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, vatAmount: event.target.value })} /></label><label>Total<input inputMode="decimal" value={manualInvoiceForm.totalAmount} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, totalAmount: event.target.value })} /></label></div><div className="form-row"><label>Producto TPV<select value={manualInvoiceForm.productId} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, productId: event.target.value })}><option value="">Asociar después</option>{productsQuery.data?.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>Descripción<input value={manualInvoiceForm.detectedName} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, detectedName: event.target.value })} placeholder="Descripción de la línea" /></label></div><div className="form-row"><label>Cantidad<input inputMode="decimal" value={manualInvoiceForm.quantity} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, quantity: event.target.value })} /></label><label>Coste unitario<input inputMode="decimal" value={manualInvoiceForm.unitCost} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, unitCost: event.target.value })} /></label><label>Total línea<input inputMode="decimal" value={manualInvoiceForm.lineTotal} onChange={(event) => setManualInvoiceForm({ ...manualInvoiceForm, lineTotal: event.target.value })} /></label></div><label className="image-upload-field">Adjuntar factura <small>{manualInvoiceForm.documentName || "PDF o imagen"}</small><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={manualDocumentMutation.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) manualDocumentMutation.mutate(file); event.currentTarget.value = ""; }} /></label><div className="inline-form__actions"><button className="secondary-button" onClick={() => setManualInvoiceOpen(false)}>Cancelar</button><button className="primary-button" disabled={manualInvoiceMutation.isPending || !manualInvoiceForm.totalAmount} onClick={() => manualInvoiceMutation.mutate()}>{manualInvoiceMutation.isPending ? "Guardando…" : "Guardar factura"}</button></div></div>}<div className="notice-card"><ReceiptText size={19} /><div><strong>Reconocimiento asistido</strong><p>Sube una factura PDF o imagen para proponer proveedor, fecha, importes y productos. Nada modifica stock sin confirmación.</p></div></div><label className={invoiceRecognitionMutation.isPending ? "invoice-dropzone invoice-dropzone--busy" : "invoice-dropzone"} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); submitInvoiceDocument(event.dataTransfer.files?.[0]); }}><Upload size={28} /><div><strong>{invoiceRecognitionMutation.isPending ? "Analizando factura…" : "Arrastra una factura aquí para registrarla"}</strong><span>Acepta PDF, JPG, PNG y WEBP. La IA propondrá proveedor, fecha, número e importe antes de que confirmes.</span></div><em>o seleccionar archivo</em><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={invoiceRecognitionMutation.isPending} onChange={(event) => { submitInvoiceDocument(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>{recognizedInvoice && <div className="admin-card recognized-invoice-card"><div className="admin-card__header"><div><span className="eyebrow">BORRADOR RECONOCIDO</span><h2>{recognizedInvoice.supplierName ?? "Proveedor no identificado"}</h2></div><span className="table-status table-status--warning">Revisión necesaria</span></div><div className="recognized-invoice-meta"><span>Nº {recognizedInvoice.invoiceNumber ?? "—"}</span><span>Fecha {recognizedInvoice.invoiceDate ?? "—"}</span><strong>{euro.format(Number(recognizedInvoice.totalAmount ?? 0))}</strong></div><p className="helper-text">{recognizedInvoice.confidenceNote}</p><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Descripción detectada</th><th>Producto TPV</th><th>Cantidad</th><th>Coste unitario</th><th>Total línea</th></tr></thead><tbody>{recognizedInvoice.lines.map((line, index) => <tr key={`${line.lineId}-${index}`}><td><strong>{line.description}</strong></td><td><select className="line-product-select" value={line.productId ?? ""} onChange={(event) => setRecognizedInvoice({ ...recognizedInvoice, lines: recognizedInvoice.lines.map((current) => current.lineId === line.lineId ? { ...current, productId: event.target.value ? Number(event.target.value) : undefined } : current) })}><option value="">Asociar…</option>{productsQuery.data?.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></td><td><input className="line-number-input" inputMode="decimal" value={line.quantity} onChange={(event) => setRecognizedInvoice({ ...recognizedInvoice, lines: recognizedInvoice.lines.map((current) => current.lineId === line.lineId ? { ...current, quantity: Number(event.target.value) || 0 } : current) })} /></td><td className="table-money"><input className="line-number-input" inputMode="decimal" value={line.unitCost} onChange={(event) => setRecognizedInvoice({ ...recognizedInvoice, lines: recognizedInvoice.lines.map((current) => current.lineId === line.lineId ? { ...current, unitCost: Number(event.target.value) || 0 } : current) })} /></td><td className="table-money"><input className="line-number-input" inputMode="decimal" value={line.lineTotal} onChange={(event) => setRecognizedInvoice({ ...recognizedInvoice, lines: recognizedInvoice.lines.map((current) => current.lineId === line.lineId ? { ...current, lineTotal: Number(event.target.value) || 0 } : current) })} /></td></tr>)}</tbody></table></div><div className="recognized-invoice-actions"><span>{recognizedInvoice.lines.filter((line) => line.productId).length} de {recognizedInvoice.lines.length} líneas asociadas</span><button className="primary-button" disabled={receiveInvoiceMutation.isPending || recognizedInvoice.lines.some((line) => !line.productId || line.quantity <= 0)} onClick={() => receiveInvoiceMutation.mutate()}>{receiveInvoiceMutation.isPending ? "Actualizando…" : "Confirmar entrada y sumar stock"}</button></div></div>}<div className="admin-card admin-table-card"><PurchaseTable invoices={invoicesQuery.data ?? []} onVoid={(invoiceId) => { if (window.confirm("¿Eliminar esta factura en borrador? No se modificará el stock.")) voidInvoiceMutation.mutate(invoiceId); }} /></div></div>}
        {tab === "sales" && <div className="admin-page"><AdminPageHeader title="Ventas e históricos" description="Consulta tickets, métodos de pago y rendimiento por artículo." /><div className="admin-card admin-table-card"><SalesTable sales={salesQuery.data ?? []} onView={setSelectedSaleId} selectedSaleId={selectedSaleId} details={saleDetailsQuery.data} onClose={() => setSelectedSaleId(null)} />{false && selectedSaleId !== null && saleDetailsQuery.data && <div className="ticket-detail-card"><div className="admin-card__header"><div><span className="eyebrow">TICKET {saleDetailsQuery.data!.saleNumber}</span><h2>Detalle de venta</h2></div><div className="ticket-detail-actions"><button className="secondary-button secondary-button--small" onClick={() => printSaleReceipt(saleDetailsQuery.data!)}><Printer size={15} /> Imprimir ticket</button><button className="icon-button" onClick={() => setSelectedSaleId(null)}><X size={17} /></button></div></div><div className="ticket-detail-lines">{saleDetailsQuery.data!.lines.map((line) => <div key={line.id}><span>{line.productName} × {line.quantity}</span><strong>{euro.format(Number(line.lineTotal))}</strong></div>)}</div><div className="ticket-detail-summary"><span>IVA incluido: {euro.format(Number(saleDetailsQuery.data!.vatAmount))}</span><strong>{euro.format(Number(saleDetailsQuery.data!.totalAmount))}</strong><span>{saleDetailsQuery.data!.payment?.method === "card" ? "Pago con tarjeta" : "Pago en efectivo"}</span></div></div>}</div><div className="admin-card admin-table-card"><div className="admin-card__header"><div><span className="eyebrow">RENDIMIENTO</span><h2>Ventas por artículo</h2></div></div><ReportTable report={reportQuery.data ?? []} /></div></div>}
        {tab === "cash" && <div className="admin-page"><AdminPageHeader title="Caja diaria" description="Una única caja, con jornada comercial de 07:00 a 07:00 y hora española." /><div className="cash-detail-grid"><div className="metric-card"><span>Fecha de negocio</span><strong>{cashQuery.data?.businessDate ?? "—"}</strong><small>07:00–07:00 · {cashQuery.data?.businessTimezone ?? "Europe/Madrid"}</small></div><div className="metric-card"><span>Total vendido</span><strong>{euro.format(Number(cashQuery.data?.totalSold ?? 0))}</strong><small>Ventas completadas de la jornada</small></div><div className="metric-card metric-card--accent"><span>Efectivo esperado</span><strong>{euro.format(Number(cashQuery.data?.expectedCash ?? 0))}</strong><small>Ventas en efectivo + fondo</small></div><div className="metric-card"><span>Tarjeta</span><strong>{euro.format(Number(cashQuery.data?.cardTotal ?? 0))}</strong><small>Confirmado en el datáfono</small></div></div><div className="admin-card cash-close-card"><div><span className="eyebrow">ARQUEO</span><h2>{cashQuery.data?.status === "closed" ? "Caja cerrada" : "Cerrar caja del día"}</h2><p>Introduce el número de monedas y billetes. El importe de efectivo se calcula automáticamente; registra también el total comprobado del datáfono.</p></div>{cashQuery.data?.status === "open" && <div className="cash-count-grid">{["0.10","0.20","0.50","1.00","2.00","5.00","10.00","20.00","50.00"].map((denomination) => { const count = Number(denominationCounts[denomination] ?? 0); const amount = count * Number(denomination); return <label key={denomination}><span>{Number(denomination).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €</span><input inputMode="numeric" min="0" type="number" value={denominationCounts[denomination] ?? ""} onChange={(event) => { const next = { ...denominationCounts, [denomination]: event.target.value }; setDenominationCounts(next); const calculated = Object.entries(next).reduce((sum, [key, value]) => sum + Number(key) * (Number(value) || 0), 0); setCloseAmount(calculated > 0 ? calculated.toFixed(2) : ""); }} placeholder="0" /><small>{euro.format(amount)}</small></label>; })}<label className="cash-count-total"><span>Efectivo contado</span><input inputMode="decimal" value={closeAmount} onChange={(event) => { setCloseAmount(event.target.value); setDenominationCounts({}); }} placeholder="Se calcula con denominaciones" /><small>Alternativa manual</small></label><label className="cash-count-total"><span>Tarjetas contadas</span><input inputMode="decimal" value={countedCard} onChange={(event) => setCountedCard(event.target.value)} placeholder={cashQuery.data?.cardTotal ?? "0,00"} /><small>Esperado: {euro.format(Number(cashQuery.data?.cardTotal ?? 0))}</small></label><button className="primary-button cash-close-submit" disabled={closeMutation.isPending || (!closeAmount && Object.values(denominationCounts).every((value) => !Number(value)))} onClick={() => closeMutation.mutate()}>Cerrar caja y guardar arqueo</button></div>}{cashQuery.data?.status === "closed" && <div className="closed-badge"><Banknote size={17} /> Cerrada correctamente</div>}</div><CashHistoryTable sessions={cashHistoryQuery.data ?? []} editingId={editingCashId} editForm={cashEditForm} setEditingId={setEditingCashId} setEditForm={setCashEditForm} onSave={(session) => updateCashMutation.mutate({ id: session.id, countedCash: Number(cashEditForm.countedCash) || 0, countedCard: Number(cashEditForm.countedCard) || 0, notes: cashEditForm.notes })} /></div>}
      </section>
    </main>
  );
}

function AdminPageHeader({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="admin-page-header"><div><h2>{title}</h2><p>{description}</p></div>{actionLabel && onAction && <button className="primary-button" onClick={onAction}><Plus size={16} /> {actionLabel}</button>}</div>;
}

function AdminProductsTable({ products, categories, vatTypes, onEdit, onDeactivate, onToggleTpv, onQuickUpdate }: { products: AdminProduct[]; categories: Category[]; vatTypes: VatType[]; onEdit: (product: AdminProduct) => void; onDeactivate: (productId: number) => void; onToggleTpv: (product: AdminProduct) => void; onQuickUpdate: (id: number, patch: QuickProductPatch) => void }) {
  const [drafts, setDrafts] = useState<Record<number, { salePrice: string; cost: string; minimumStock: string; barcode: string }>>({});
  const draftFor = (product: AdminProduct) => drafts[product.id] ?? { salePrice: String(product.salePrice), cost: String(product.cost), minimumStock: String(product.minimumStock), barcode: product.barcode ?? "" };
  const updateDraft = (product: AdminProduct, field: keyof ReturnType<typeof draftFor>, value: string) => setDrafts((current) => ({ ...current, [product.id]: { ...draftFor(product), [field]: value } }));
  const commitNumber = (product: AdminProduct, field: "salePrice" | "cost" | "minimumStock", rawValue: string) => {
    const value = Number(rawValue.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) { updateDraft(product, field, field === "cost" ? String(product.cost) : field === "salePrice" ? String(product.salePrice) : String(product.minimumStock)); return; }
    const original = field === "cost" ? Number(product.cost) : field === "salePrice" ? Number(product.salePrice) : Number(product.minimumStock);
    if (Math.abs(value - original) < 0.0001) return;
    const patch: QuickProductPatch = field === "cost" ? { weightedAverageCost: value, lastPurchaseCost: value } : field === "salePrice" ? { salePrice: value } : { minimumStock: Math.floor(value) };
    onQuickUpdate(product.id, patch);
  };
  const commitBarcode = (product: AdminProduct, value: string) => { const normalized = value.trim(); if (normalized !== (product.barcode ?? "")) onQuickUpdate(product.id, { barcode: normalized || null }); };
  return <div className="data-table-wrap"><table className="data-table products-quick-table"><thead><tr><th>Artículo</th><th>Familia</th><th>Precio venta</th><th>IVA</th><th>Código</th><th>Coste medio</th><th>Stock</th><th>Mínimo</th><th>En TPV</th><th>Acción</th></tr></thead><tbody>{products.map((product) => { const draft = draftFor(product); return <tr key={product.id}><td><div className="table-product"><ProductImage product={product} compact /><strong>{product.name}</strong></div></td><td><select className="quick-cell-select" aria-label={`Familia de ${product.name}`} value={product.categoryId} onChange={(event) => onQuickUpdate(product.id, { categoryId: Number(event.target.value) })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.parentCategoryId ? `↳ ${category.name}` : category.name}</option>)}</select></td><td><input className="quick-cell-input quick-cell-input--money" aria-label={`Precio de ${product.name}`} inputMode="decimal" value={draft.salePrice} onChange={(event) => updateDraft(product, "salePrice", event.target.value)} onBlur={(event) => commitNumber(product, "salePrice", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); } }} /></td><td><select className="quick-cell-select quick-cell-select--small" aria-label={`IVA de ${product.name}`} value={product.vatTypeId ?? ""} onChange={(event) => onQuickUpdate(product.id, { vatTypeId: event.target.value ? Number(event.target.value) : null })}><option value="">—</option>{vatTypes.filter((vatType) => vatType.isActive).map((vatType) => <option key={vatType.id} value={vatType.id}>{vatType.rate}%</option>)}</select></td><td><input className="quick-cell-input" aria-label={`Código de ${product.name}`} value={draft.barcode} placeholder="—" onChange={(event) => updateDraft(product, "barcode", event.target.value)} onBlur={(event) => commitBarcode(product, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></td><td><input className="quick-cell-input quick-cell-input--money" aria-label={`Coste de ${product.name}`} inputMode="decimal" value={draft.cost} onChange={(event) => updateDraft(product, "cost", event.target.value)} onBlur={(event) => commitNumber(product, "cost", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></td><td><span className={Number(product.stock) <= Number(product.minimumStock) ? "table-status table-status--warning" : "table-status"}>{product.stock} {product.unit}</span></td><td><input className="quick-cell-input quick-cell-input--integer" aria-label={`Stock mínimo de ${product.name}`} inputMode="numeric" value={draft.minimumStock} onChange={(event) => updateDraft(product, "minimumStock", event.target.value.replace(/[^0-9]/g, ""))} onBlur={(event) => commitNumber(product, "minimumStock", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></td><td><button className={product.showInTpv !== false ? "tpv-toggle tpv-toggle--on" : "tpv-toggle"} role="switch" aria-checked={product.showInTpv !== false} onClick={() => onToggleTpv(product)} title={product.showInTpv !== false ? "Ocultar temporalmente del TPV" : "Mostrar en el TPV"}><span /></button></td><td><div className="table-actions"><button className="table-icon-button" onClick={() => onEdit(product)} title="Editar artículo"><Settings size={15} /></button><button className="table-icon-button table-icon-button--danger" onClick={() => onDeactivate(product.id)} title="Retirar artículo"><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table>{products.length === 0 && <div className="admin-empty">No hay productos. Añade el primero desde el botón superior.</div>}<small className="quick-edit-hint">Los cambios de familia, IVA y los campos editables se guardan al cambiar o salir de cada celda.</small></div>;
}

function InventoryTable({ products, onAdjust }: { products: AdminProduct[]; onAdjust: (productId: number, quantity: number) => void }) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Artículo</th><th>Stock actual</th><th>Mínimo</th><th>Acción</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small className="table-subtext">{product.categoryName}</small></td><td><span className={Number(product.stock) <= Number(product.minimumStock) ? "table-status table-status--warning" : "table-status"}>{product.stock} {product.unit}</span></td><td>{product.minimumStock}</td><td><div className="table-edit"><input inputMode="decimal" value={drafts[product.id] ?? product.stock} onChange={(event) => setDrafts({ ...drafts, [product.id]: event.target.value })} /><button className="secondary-button secondary-button--small" onClick={() => onAdjust(product.id, Number(drafts[product.id]))}>Guardar</button></div></td></tr>)}</tbody></table>{products.length === 0 && <div className="admin-empty">No hay artículos para controlar.</div>}</div>;
}

function SupplierTable({ suppliers, onEdit, onDeactivate }: { suppliers: Supplier[]; onEdit: (supplier: Supplier) => void; onDeactivate: (id: number) => void }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Proveedor</th><th>Razón social</th><th>NIF/CIF</th><th>Contacto</th><th>Acción</th></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.id}><td><strong>{supplier.name}</strong></td><td>{supplier.legalName ?? "—"}</td><td>{supplier.taxId ?? "—"}</td><td>{supplier.phone ?? supplier.email ?? "—"}</td><td><div className="table-actions"><button className="table-icon-button" onClick={() => onEdit(supplier)} title="Editar proveedor"><Settings size={15} /></button><button className="table-icon-button table-icon-button--danger" onClick={() => onDeactivate(supplier.id)} title="Retirar proveedor"><Trash2 size={15} /></button></div></td></tr>)}</tbody></table>{suppliers.length === 0 && <div className="admin-empty">Aún no hay proveedores.</div>}</div>;
}

function FiscalQrPreview({ payload, hash }: { payload: string; hash: string }) {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 220 })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setDataUrl(""); });
    return () => { cancelled = true; };
  }, [payload]);
  return <div className="ticket-fiscal-preview"><div><strong>QR DE PREPARACIÓN</strong><span>No válido todavía para AEAT</span></div>{dataUrl ? <img src={dataUrl} alt="QR de preparación fiscal" /> : <div className="ticket-fiscal-preview__loading">Generando QR…</div>}<code>{hash}</code></div>;
}

function TicketDetailInline({ sale, onClose }: { sale: SaleDetails; onClose: () => void }) {
  const fiscalRecord = sale.fiscal?.record;
  return <div className="ticket-detail-card ticket-detail-card--inline"><div className="admin-card__header"><div><span className="eyebrow">TICKET {sale.saleNumber}</span><h2>Detalle de venta</h2></div><div className="ticket-detail-actions"><button className="secondary-button secondary-button--small" onClick={() => printSaleReceipt(sale)}><Printer size={15} /> Imprimir ticket</button><button className="icon-button" onClick={onClose}><X size={17} /></button></div></div><div className="ticket-detail-lines">{sale.lines.map((line) => <div key={line.id}><span>{line.productName} × {line.quantity}</span><strong>{euro.format(Number(line.lineTotal))}</strong></div>)}</div><div className="ticket-detail-summary"><span>IVA incluido: {euro.format(Number(sale.vatAmount))}</span><strong>{euro.format(Number(sale.totalAmount))}</strong><span>{sale.payment?.method === "card" ? "Pago con tarjeta" : "Pago en efectivo"}</span></div>{fiscalRecord?.qrPayload ? <FiscalQrPreview payload={fiscalRecord.qrPayload} hash={fiscalRecord.recordHash} /> : <div className="ticket-fiscal-missing">Este ticket es anterior a la preparación Veri*Factu y no tiene QR fiscal.</div>}</div>;
}

function SalesTable({ sales, onView, selectedSaleId, details, onClose }: { sales: SaleRow[]; onView?: (saleId: number) => void; selectedSaleId?: number | null; details?: SaleDetails | null; onClose?: () => void }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Ticket</th><th>Fecha y hora</th><th>Método</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>{sales.map((sale) => <Fragment key={sale.id}><tr><td><strong>{sale.saleNumber}</strong></td><td>{new Date(sale.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</td><td><span className="payment-pill">{sale.method === "card" ? <CreditCard size={13} /> : <Banknote size={13} />} {sale.method === "card" ? "Tarjeta" : "Efectivo"}</span></td><td className="table-money">{euro.format(Number(sale.totalAmount))}</td><td><span className="table-status table-status--success">{sale.status === "completed" ? "Completado" : sale.status}</span></td><td>{onView && <button className="secondary-button secondary-button--small" onClick={() => onView(sale.id)}><ReceiptText size={14} /> Ver ticket</button>}</td></tr>{selectedSaleId === sale.id && details && <tr className="ticket-detail-row"><td colSpan={6}><TicketDetailInline sale={details} onClose={onClose ?? (() => undefined)} /></td></tr>}</Fragment>)}</tbody></table>{sales.length === 0 && <div className="admin-empty">No hay ventas registradas todavía.</div>}</div>;
}

function ReportTable({ report }: { report: ReportRow[] }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Artículo</th><th>Unidades</th><th>Ingresos</th><th>Coste</th><th>Margen bruto</th></tr></thead><tbody>{report.map((row) => <tr key={`${row.productId}-${row.productName}`}><td><strong>{row.productName}</strong></td><td>{row.units}</td><td className="table-money">{euro.format(Number(row.revenue))}</td><td className="table-money">{euro.format(Number(row.cost))}</td><td className="table-money table-money--positive">{euro.format(Number(row.margin))}</td></tr>)}</tbody></table>{report.length === 0 && <div className="admin-empty">El informe aparecerá al registrar ventas.</div>}</div>;
}

function PurchaseTable({ invoices, onVoid }: { invoices: PurchaseRow[]; onVoid: (invoiceId: number) => void }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Factura</th><th>Proveedor</th><th>Fecha</th><th>Total</th><th>OCR</th><th>Estado</th><th></th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoiceNumber ?? `Borrador #${invoice.id}`}</strong></td><td>{invoice.supplierName ?? "Sin asignar"}</td><td>{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString("es-ES") : "—"}</td><td className="table-money">{euro.format(Number(invoice.totalAmount))}</td><td><span className={invoice.ocrStatus === "ready" || invoice.ocrStatus === "reviewed" ? "table-status table-status--success" : "table-status table-status--warning"}>{invoice.ocrStatus}</span></td><td>{invoice.status}</td><td>{invoice.status === "draft" && <button className="secondary-button secondary-button--small" onClick={() => onVoid(invoice.id)}><Trash2 size={14} /> Eliminar</button>}</td></tr>)}</tbody></table>{invoices.length === 0 && <div className="admin-empty">No hay facturas de compra. Puedes registrar la primera cuando esté disponible el cargador.</div>}</div>;
}

type DeferredInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function App() {
  const [view, setView] = useState<"pos" | "admin">("pos");
  const [navigationOpen, setNavigationOpen] = useState(false);
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
      {view === "pos" ? <PosScreen onOpenMenu={() => setNavigationOpen(true)} /> : <AdminScreen onBack={() => setView("pos")} onOpenMenu={() => setNavigationOpen(true)} />}
      {navigationOpen && <div className="navigation-overlay" role="presentation" onClick={() => setNavigationOpen(false)}><aside className="navigation-drawer" role="dialog" aria-label="Menú principal" onClick={(event) => event.stopPropagation()}><div className="navigation-drawer__header"><div><span className="eyebrow">SWEET &amp; SALTY</span><h2>Menú principal</h2></div><button className="navigation-close" onClick={() => setNavigationOpen(false)} aria-label="Cerrar menú"><X size={28} /></button></div><button className={view === "pos" ? "navigation-option navigation-option--active" : "navigation-option"} onClick={() => { setView("pos"); setNavigationOpen(false); }}><ShoppingBag size={26} /><span><strong>Ventas</strong><small>Volver al terminal TPV</small></span></button><button className={view === "admin" ? "navigation-option navigation-option--active" : "navigation-option"} onClick={() => { setView("admin"); setNavigationOpen(false); }}><LayoutGrid size={26} /><span><strong>Administración</strong><small>Informes, productos, stock y configuración</small></span></button></aside></div>}
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


function VatSettingsPanel({ vatTypes, form, setForm, onCreate, isPending, onRepairVat, repairVatPending, smtpForm, setSmtpForm, settings, smtpSaving, smtpTesting, onSaveSmtp, onTestSmtp }: { vatTypes: VatType[]; form: { name: string; rate: string }; setForm: (value: { name: string; rate: string }) => void; onCreate: () => void; isPending: boolean; onRepairVat: () => void; repairVatPending: boolean; smtpForm: { smtpHost: string; smtpPort: string; smtpSecure: boolean; smtpUser: string; smtpPassword: string; smtpFrom: string; clearPassword: boolean }; setSmtpForm: (value: { smtpHost: string; smtpPort: string; smtpSecure: boolean; smtpUser: string; smtpPassword: string; smtpFrom: string; clearPassword: boolean }) => void; settings?: PosSettings; smtpSaving: boolean; smtpTesting: boolean; onSaveSmtp: () => void; onTestSmtp: () => void }) {
  return <div className="admin-page settings-page"><AdminPageHeader title="Configuración" description="Gestiona los tipos de IVA y los datos SMTP que utiliza el TPV para enviar recibos por correo." /><section className="admin-card smtp-settings-card"><div className="admin-card__header"><div><span className="eyebrow">RECIBOS POR CORREO</span><h2>Servidor SMTP</h2></div><span className={settings?.smtpPasswordConfigured ? "table-status table-status--success" : "table-status table-status--warning"}>{settings?.smtpPasswordConfigured ? "Configurado" : "Pendiente"}</span></div><p className="helper-text">Estos datos se guardan en la configuración de Sweet &amp; Salty. La contraseña existente nunca se muestra; deja el campo vacío para conservarla.</p><div className="smtp-settings-grid"><label>Servidor SMTP<input value={smtpForm.smtpHost} onChange={(event) => setSmtpForm({ ...smtpForm, smtpHost: event.target.value })} placeholder="smtp.tu-proveedor.com" autoComplete="off" /></label><label>Puerto<input type="number" min="1" max="65535" value={smtpForm.smtpPort} onChange={(event) => setSmtpForm({ ...smtpForm, smtpPort: event.target.value })} placeholder="587" /></label><label>Usuario<input value={smtpForm.smtpUser} onChange={(event) => setSmtpForm({ ...smtpForm, smtpUser: event.target.value })} placeholder="cuenta@dominio.com" autoComplete="username" /></label><label>Remitente<input type="email" value={smtpForm.smtpFrom} onChange={(event) => setSmtpForm({ ...smtpForm, smtpFrom: event.target.value })} placeholder="cuenta@dominio.com" /></label><label>Contraseña SMTP<input type="password" value={smtpForm.smtpPassword} onChange={(event) => setSmtpForm({ ...smtpForm, smtpPassword: event.target.value, clearPassword: false })} placeholder={settings?.smtpPasswordConfigured ? "Conservada; escribe solo para cambiarla" : "Contraseña del buzón"} autoComplete="new-password" /></label><label className="smtp-checkbox"><span>Seguridad</span><span className="checkbox-control"><input type="checkbox" checked={smtpForm.smtpSecure} onChange={(event) => setSmtpForm({ ...smtpForm, smtpSecure: event.target.checked })} /> Usar TLS seguro (puerto 465)</span></label></div><div className="smtp-settings-actions"><button className="secondary-button" disabled={smtpTesting || smtpSaving || !settings?.smtpPasswordConfigured} onClick={onTestSmtp}><Mail size={16} /> {smtpTesting ? "Probando…" : "Probar conexión"}</button><button className="primary-button" disabled={smtpSaving || !smtpForm.smtpHost || !smtpForm.smtpUser || (!settings?.smtpPasswordConfigured && !smtpForm.smtpPassword)} onClick={onSaveSmtp}>{smtpSaving ? "Guardando…" : "Guardar configuración SMTP"}</button></div><div className="smtp-settings-footer"><small className="helper-text">Origen actual: {settings?.smtpSource === "database" ? "Administración" : settings?.smtpSource === "environment" ? "variables de entorno" : "sin configurar"}.</small>{settings?.smtpPasswordConfigured && <button className="text-button text-button--danger" onClick={() => setSmtpForm({ ...smtpForm, smtpPassword: "", clearPassword: true })}>Borrar contraseña guardada</button>}</div></section><section className="admin-card vat-repair-card"><div className="admin-card__header"><div><span className="eyebrow">DATOS IMPORTADOS</span><h2>Corregir IVA 7 %</h2></div></div><p className="helper-text">Normaliza únicamente artículos con variante de Loyverse y porcentaje 7 % usando el IVA predeterminado válido (0 %, 4 %, 10 % o 21 %). No modifica ventas, tickets ni registros fiscales.</p><button className="secondary-button" disabled={repairVatPending} onClick={onRepairVat}>{repairVatPending ? "Corrigiendo…" : "Corregir artículos importados"}</button></section><div className="admin-columns"><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">NUEVO TIPO</span><h2>Añadir tipo de IVA</h2></div></div><div className="vat-form"><label>Nombre<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. IVA reducido" /></label><label>Porcentaje<input type="number" min="0" max="100" step="0.01" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} placeholder="10" /></label><button className="primary-button" disabled={isPending || !form.name || !form.rate} onClick={onCreate}><Plus size={15} /> Guardar tipo</button></div></section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">TIPOS DISPONIBLES</span><h2>Tipos de IVA configurados</h2></div></div><div className="vat-list">{vatTypes.map((vatType) => <div className="vat-list__row" key={vatType.id}><div><strong>{vatType.name}</strong><small>Aplicable a nuevos artículos y productos editados</small></div><b>{Number(vatType.rate).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%</b></div>)}</div>{vatTypes.length === 0 && <div className="admin-empty">Todavía no hay tipos configurados.</div>}</section></div></div>;
}


function CashHistoryTable({ sessions, editingId, editForm, setEditingId, setEditForm, onSave }: { sessions: CashSessionRow[]; editingId: number | null; editForm: { countedCash: string; countedCard: string; notes: string }; setEditingId: (id: number | null) => void; setEditForm: (value: { countedCash: string; countedCard: string; notes: string }) => void; onSave: (session: CashSessionRow) => void }) {
  return <section className="admin-card cash-history-card"><div className="admin-card__header"><div><span className="eyebrow">HISTÓRICO</span><h2>Cajas cerradas y arqueos</h2><p className="admin-card__description">Consulta jornadas anteriores y corrige el efectivo o la tarjeta contada cuando sea necesario.</p></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Jornada</th><th>Ventas</th><th>Efectivo esperado</th><th>Efectivo contado</th><th>Tarjeta</th><th>Descuadre</th><th>Estado</th><th></th></tr></thead><tbody>{sessions.map((session) => editingId === session.id ? <tr key={session.id}><td><strong>{session.businessDate}</strong><small className="table-subtext">Cierre {session.closedAt ? new Date(session.closedAt).toLocaleString("es-ES") : "—"}</small></td><td className="table-money">{euro.format(Number(session.totalSold))}</td><td className="table-money">{euro.format(Number(session.expectedCash))}</td><td><input className="history-edit-input" type="number" min="0" step="0.01" value={editForm.countedCash} onChange={(event) => setEditForm({ ...editForm, countedCash: event.target.value })} /></td><td><input className="history-edit-input" type="number" min="0" step="0.01" value={editForm.countedCard} onChange={(event) => setEditForm({ ...editForm, countedCard: event.target.value })} /></td><td>—</td><td><span className="table-status table-status--success">Cerrada</span></td><td><div className="table-actions"><button className="secondary-button secondary-button--small" onClick={() => onSave(session)}>Guardar</button><button className="table-icon-button" onClick={() => setEditingId(null)}><X size={14} /></button></div></td></tr> : <tr key={session.id}><td><strong>{session.businessDate}</strong><small className="table-subtext">Cierre {session.closedAt ? new Date(session.closedAt).toLocaleString("es-ES") : "—"}</small></td><td className="table-money">{euro.format(Number(session.totalSold))}</td><td className="table-money">{euro.format(Number(session.expectedCash))}</td><td className="table-money">{session.countedCash === null ? "—" : euro.format(Number(session.countedCash))}</td><td className="table-money">{euro.format(Number(session.countedCard ?? session.cardTotal))}</td><td className={Number(session.difference) === 0 ? "table-money" : "table-money table-money--negative"}>{session.difference === null ? "—" : euro.format(Number(session.difference))}</td><td><span className={session.status === "closed" ? "table-status table-status--success" : "table-status table-status--warning"}>{session.status === "closed" ? "Cerrada" : "Abierta"}</span></td><td>{session.status === "closed" && <button className="secondary-button secondary-button--small" onClick={() => { setEditingId(session.id); setEditForm({ countedCash: session.countedCash ?? "", countedCard: session.countedCard ?? session.cardTotal, notes: session.notes ?? "" }); }}>Editar arqueo</button>}</td></tr>)}</tbody></table></div>{sessions.length === 0 && <div className="admin-empty">Todavía no hay cajas cerradas.</div>}</section>;
}


function PromotionManager({ categories, products, promotions, formOpen, form, setForm, onOpenCreate, onClose, onSave, saving, onDeactivate }: { categories: Category[]; products: AdminProduct[]; promotions: Promotion[]; formOpen: boolean; form: { productId: string; name: string; comboPrice: string; slots: PromotionDraftSlot[] }; setForm: React.Dispatch<React.SetStateAction<{ productId: string; name: string; comboPrice: string; slots: PromotionDraftSlot[] }>>; onOpenCreate: () => void; onClose: () => void; onSave: () => void; saving: boolean; onDeactivate: (id: number) => void }) {
  const promotionCategories = categories.filter((category) => category.isPromotion && category.isActive !== false);
  const promotionProducts = products.filter((product) => promotionCategories.some((category) => category.id === product.categoryId) && product.isActive !== false);
  const getComponentCategoryIds = (categoryId: string) => { const parentId = Number(categoryId); return new Set(categories.filter((category) => category.id === parentId || category.parentCategoryId === parentId).map((category) => category.id)); };
  const updateSlot = (index: number, changes: Partial<PromotionDraftSlot>) => setForm((current) => ({ ...current, slots: current.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...changes, ...(changes.categoryId !== undefined ? { productIds: [] } : {}) } : slot) }));
  return <div className="admin-page"><AdminPageHeader title="Promociones y combos" description="Crea ofertas combinadas: el cliente selecciona un artículo de cada familia y el TPV descuenta cada componente del stock." actionLabel="Nueva promoción" onAction={onOpenCreate} />{promotionCategories.length === 0 && <div className="notice-card"><ReceiptText size={19} /><div><strong>Primero crea una familia de promociones</strong><p>Ve a Familias, marca «Familia de promociones», crea el artículo del combo dentro de esa familia y vuelve aquí.</p></div></div>}{formOpen && <section className="admin-card promotion-form-card"><div className="admin-card__header"><div><span className="eyebrow">NUEVO COMBO</span><h2>Configurar promoción</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={17} /></button></div><div className="form-row"><label>Artículo visible en Promociones<select value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}><option value="">Selecciona el artículo combo…</option>{promotionProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>Nombre de la oferta<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Promo Mediodía" /></label><label>Precio del combo<input type="number" min="0" step="0.01" inputMode="decimal" value={form.comboPrice} onChange={(event) => setForm({ ...form, comboPrice: event.target.value })} placeholder="5,00" /></label></div><div className="promotion-slots-header"><div><span className="eyebrow">COMPONENTES</span><h3>Familias y artículos permitidos</h3></div><span>{form.slots.length}/3 huecos</span></div><div className="promotion-slots">{form.slots.map((slot, index) => { const componentCategoryIds = getComponentCategoryIds(slot.categoryId);
  const allowedProducts = products.filter((product) => componentCategoryIds.has(product.categoryId) && product.isActive !== false); return <div className="promotion-slot-card" key={`${index}-${slot.categoryId}`}><div className="promotion-slot-card__header"><strong>Opción {index + 1}</strong>{form.slots.length > 1 && <button className="table-icon-button table-icon-button--danger" type="button" onClick={() => setForm({ ...form, slots: form.slots.filter((_, slotIndex) => slotIndex !== index) })}><X size={15} /></button>}</div><div className="form-row"><label>Familia<select value={slot.categoryId} onChange={(event) => updateSlot(index, { categoryId: event.target.value })}><option value="">Selecciona una familia…</option>{categories.filter((category) => !category.isPromotion && category.isActive !== false).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Etiqueta<input value={slot.label} onChange={(event) => updateSlot(index, { label: event.target.value })} placeholder="Ej. Bocadillo" /></label></div><div className="promotion-products-picker">{!slot.categoryId ? <span className="helper-text">Selecciona una familia para elegir sus artículos.</span> : allowedProducts.length === 0 ? <span className="helper-text">No hay artículos activos en esta familia.</span> : allowedProducts.map((product) => <label className="promotion-product-option" key={product.id}><input type="checkbox" checked={slot.productIds.includes(product.id)} onChange={(event) => updateSlot(index, { productIds: event.target.checked ? [...slot.productIds, product.id] : slot.productIds.filter((id) => id !== product.id) })} /><span>{product.name}</span><small>{euro.format(Number(product.salePrice))}</small></label>)}</div></div>; })}</div>{form.slots.length < 3 && <button className="secondary-button" type="button" onClick={() => setForm({ ...form, slots: [...form.slots, { label: "", categoryId: "", productIds: [] }] })}><Plus size={16} /> Añadir otra familia</button>}<p className="helper-text">Al vender el combo, se registra su precio y se descuenta una unidad de cada artículo elegido. Se pueden permitir varios artículos dentro de cada familia.</p><div className="inline-form__actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving || !form.productId || !form.name.trim() || !form.comboPrice || form.slots.some((slot) => !slot.categoryId || !slot.label.trim() || slot.productIds.length === 0)} onClick={onSave}>{saving ? "Guardando…" : "Guardar promoción"}</button></div></section>}<section className="admin-card admin-table-card"><div className="admin-card__header"><div><span className="eyebrow">COMBOS CONFIGURADOS</span><h2>Promociones activas</h2></div></div>{promotions.length === 0 ? <div className="admin-empty">Todavía no hay promociones configuradas.</div> : <div className="promotion-list">{promotions.filter((promotion) => promotion.isActive).map((promotion) => <article className="promotion-list__row" key={promotion.id}><div><strong>{promotion.name}</strong><span>{promotion.productName} · {euro.format(Number(promotion.comboPrice))}</span><small>{promotion.slots.map((slot) => `${slot.label}: ${slot.products.map((product) => product.productName).join(", ")}`).join(" · ")}</small></div><button className="secondary-button secondary-button--small" onClick={() => { if (window.confirm(`¿Retirar la promoción ${promotion.name}?`)) onDeactivate(promotion.id); }}><Power size={15} /> Retirar</button></article>)}</div>}</section></div>;
}

function CategoryManager({ categories, formOpen, editingId, form, imageUrl, isSaving, imageLoading, onOpenCreate, onClose, onFormChange, onImage, onRemoveImage, onSave, onEdit, onMove, onDeactivate }: { categories: Category[]; formOpen: boolean; editingId: number | null; form: { name: string; parentCategoryId: string; color: string; iconName: string; isPromotion: boolean }; imageUrl: string | null; isSaving: boolean; imageLoading: boolean; onOpenCreate: () => void; onClose: () => void; onFormChange: (value: { name: string; parentCategoryId: string; color: string; iconName: string; isPromotion: boolean }) => void; onImage: (file: File) => void; onRemoveImage: () => void; onSave: () => void; onEdit: (category: Category) => void; onMove: (category: Category, direction: -1 | 1) => void; onDeactivate: (category: Category) => void }) {
  const iconOptions = [{ value: "Folder", label: "Carpeta" }, { value: "Coffee", label: "Café" }, { value: "UtensilsCrossed", label: "Comida" }, { value: "ShoppingBag", label: "Bolsa" }, { value: "GlassWater", label: "Bebida" }];
  const colors = ["#4C8A5A", "#875A3B", "#DD7B47", "#708E59", "#5680A5", "#775E93", "#B06771", "#5C7D84"];
  return <div className="admin-page"><AdminPageHeader title="Familias del menú" description="Crea familias y subfamilias locales para la venta rápida, con padre opcional, orden, color, icono o fotografía." actionLabel="Nueva familia" onAction={onOpenCreate} />{formOpen && <section className="admin-card category-form-card context-edit-form"><div className="admin-card__header"><div><span className="eyebrow">{editingId ? "EDITAR FAMILIA" : "NUEVA FAMILIA"}</span><h2>{editingId ? "Personalizar familia" : "Crear una familia de productos"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar formulario"><X size={17} /></button></div><div className="category-form-grid"><label>Nombre<input value={form.name} onChange={(event) => onFormChange({ ...form, name: event.target.value })} placeholder="Ej. Bebidas" /></label><label>Familia padre<select value={form.parentCategoryId} disabled={form.isPromotion} onChange={(event) => onFormChange({ ...form, parentCategoryId: event.target.value })}><option value="">Sin padre · familia principal</option>{categories.filter((category) => category.parentCategoryId === null && !category.isPromotion && category.id !== editingId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Icono<select value={form.iconName} onChange={(event) => onFormChange({ ...form, iconName: event.target.value })}>{iconOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label className="checkbox-field category-promotion-toggle"><input type="checkbox" checked={form.isPromotion} onChange={(event) => onFormChange({ ...form, isPromotion: event.target.checked })} /><span><strong>Familia de promociones</strong><small>Los artículos de esta familia serán combos configurables.</small></span></label><div className="category-color-picker"><span>Color del recuadro</span><div>{colors.map((color) => <button key={color} type="button" className={form.color === color ? "category-color-dot category-color-dot--selected" : "category-color-dot"} style={{ background: color }} onClick={() => onFormChange({ ...form, color })} aria-label={`Usar ${color}`} />)}<input type="color" value={form.color} onChange={(event) => onFormChange({ ...form, color: event.target.value })} aria-label="Color personalizado" /></div></div><label className="image-upload-field">Foto de la familia <small>{imageUrl ? "Imagen cargada" : "Opcional: se mostrará a pantalla completa"}</small><input type="file" accept="image/jpeg,image/png,image/webp" disabled={imageLoading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onImage(file); event.currentTarget.value = ""; }} /></label></div><div className="category-form-preview" style={{ "--family-color": form.color } as React.CSSProperties}><div className={imageUrl ? "category-form-preview__media category-form-preview__media--image" : "category-form-preview__media"}>{imageUrl ? <><img src={imageUrl} alt="Vista previa de familia" /><button type="button" className="image-remove-button" onClick={onRemoveImage} aria-label="Quitar imagen de la familia" title="Quitar imagen"><X size={15} /></button></> : <CategoryVisual category={{ id: 0, name: form.name || "Familia", color: form.color, imageUrl: null, iconName: form.iconName, sortOrder: 0, isFeatured: false, isPromotion: form.isPromotion, parentCategoryId: form.parentCategoryId ? Number(form.parentCategoryId) : null }} />}</div><span>{form.name || "Nombre de familia"}</span></div><div className="inline-form__actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={isSaving || !form.name.trim()} onClick={onSave}>{isSaving ? "Guardando…" : editingId ? "Guardar familia" : "Crear familia"}</button></div></section>}<section className="admin-card category-list-card"><div className="admin-card__header"><div><span className="eyebrow">ORDEN DEL TPV</span><h2>Familias y subfamilias locales</h2><p className="admin-card__description">Usa las flechas para reorganizar cómo aparecen en la primera pantalla del TPV.</p></div></div><div className="category-admin-list">{categories.map((category, index) => <article className={category.isActive === false ? "category-admin-row category-admin-row--inactive" : "category-admin-row"} key={category.id}><div className="category-admin-row__order"><GripVertical size={17} /><b>{String(index + 1).padStart(2, "0")}</b></div><div className="category-admin-row__preview" style={{ background: category.color }}>{category.imageUrl ? <img src={category.imageUrl} alt="" /> : <CategoryVisual category={category} compact />}</div><div className="category-admin-row__name"><strong>{category.name}</strong><small>{category.parentCategoryId ? `↳ Subfamilia de ${categories.find((parent) => parent.id === category.parentCategoryId)?.name ?? "familia"}` : "Familia principal"} · {category.imageUrl ? "Imagen" : `Icono: ${category.iconName}`} · {category.isActive === false ? "Oculta" : "Visible en TPV"}</small></div><div className="category-admin-row__actions"><button className="table-icon-button" disabled={index === 0} onClick={() => onMove(category, -1)} title="Subir">↑</button><button className="table-icon-button" disabled={index === categories.length - 1} onClick={() => onMove(category, 1)} title="Bajar">↓</button><button className="table-icon-button" onClick={() => onEdit(category)} title="Editar"><Pencil size={15} /></button>{category.isActive !== false && <button className="table-icon-button table-icon-button--danger" onClick={() => onDeactivate(category)} title="Retirar familia"><Power size={15} /></button>}</div></article>)}</div>{categories.length === 0 && <div className="admin-empty">Todavía no hay familias. Crea la primera para organizar el menú.</div>}</section></div>;
}


const ISSUER = {
  name: "Sweet & Salty",
  address: "Calle Adriano 6",
  postalCity: "41001 Sevilla",
  holder: "Ana Perez Peramo",
  taxId: "77807125B",
};

async function printSaleReceipt(sale: SaleDetails) {
  const printWindow = window.open("", "sweet-salty-receipt", "width=420,height=720");
  if (!printWindow) { toast.error("El navegador ha bloqueado la impresión", { description: "Permite ventanas emergentes para imprimir tickets." }); return; }
  const escape = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] ?? character));
  const lines = sale.lines.map((line) => `<tr><td>${escape(line.productName)}<br><small>${escape(line.quantity)} ud. × ${euro.format(Number(line.unitPrice))}</small></td><td>${euro.format(Number(line.lineTotal))}</td></tr>`).join("");
  const date = new Date(sale.createdAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
  const qrPayload = sale.fiscal?.record?.qrPayload ?? "";
  const qrDataUrl = qrPayload ? await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "M", margin: 1, width: 180 }) : "";
  const qrBlock = qrDataUrl ? `<div class=\"qr\"><img src=\"${qrDataUrl}\" alt=\"QR de preparación\"><small>QR DE PREPARACIÓN · NO VÁLIDO AEAT</small><code>${escape(sale.fiscal?.record?.recordHash ?? "")}</code></div>` : "";
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket ${escape(sale.saleNumber)}</title><style>@page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{width:72mm;margin:0;color:#111;font:12px Arial,sans-serif}h1,h2,p{margin:0;text-align:center}h1{font-size:20px;margin-bottom:4px}h2{font-size:12px;font-weight:400;margin-bottom:3px}.issuer{font-size:10px;text-align:center;margin-bottom:10px}.issuer p{margin:2px 0}.meta{border-top:1px dashed #111;border-bottom:1px dashed #111;padding:7px 0;margin-bottom:9px;font-size:10px}table{width:100%;border-collapse:collapse}td{padding:4px 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}small{font-size:10px}.total{display:flex;justify-content:space-between;border-top:1px dashed #111;margin-top:8px;padding-top:8px;font-size:16px;font-weight:700}.foot{margin-top:14px;font-size:10px}.qr{text-align:center;border-top:1px dashed #111;margin-top:10px;padding-top:8px}.qr img{display:block;width:45mm;height:45mm;margin:0 auto 4px}.qr small{display:block;font-size:8px}.qr code{display:block;margin-top:3px;font-size:6px;word-break:break-all}@media print{body{width:72mm}}</style></head><body><h1>${ISSUER.name}</h1><h2>Ticket de venta</h2><div class="issuer"><p>${ISSUER.address}</p><p>${ISSUER.postalCity}</p><p>${ISSUER.holder} · NIF ${ISSUER.taxId}</p></div><div class="meta">${escape(sale.saleNumber)}<br>${escape(date)}<br>${sale.payment?.method === "card" ? "Pago con tarjeta" : "Pago en efectivo"}</div><table>${lines}</table><div class="total"><span>TOTAL</span><span>${euro.format(Number(sale.totalAmount))}</span></div><p class="foot">IVA incluido: ${euro.format(Number(sale.vatAmount))}<br>Gracias por tu visita</p>${qrBlock}<script>window.onload=()=>{window.focus();window.print();};<\/script></body></html>`);
  printWindow.document.close();
}

function FiscalReadinessPanel({ data, loading, verifying, onVerify, onCancel, onRectify, correcting }: { data?: FiscalReadiness; loading: boolean; verifying: boolean; onVerify: () => void; onCancel: (fiscalInvoiceId: number) => void; onRectify: (fiscalInvoiceId: number, totalAmount: number) => void; correcting: boolean }) {
  if (loading) return <div className="admin-page"><div className="admin-card admin-empty">Cargando preparación fiscal…</div></div>;
  const profile = data?.profile;
  return <div className="admin-page fiscal-page"><AdminPageHeader title="Fiscal · preparación Veri*Factu" description="Modo de pruebas. No se han remitido registros a AEAT ni se declara aún la conformidad del sistema." /><div className="notice-card"><ReceiptText size={19} /><div><strong>{data?.notice ?? "Modo de preparación"}</strong><p>Los registros se generan con cadena SHA-256 y se conservan para pruebas de trazabilidad. La activación real requiere certificado, pruebas AEAT y validación fiscal.</p></div></div><div className="metric-grid"><div className="metric-card metric-card--accent"><span>Registros encadenados</span><strong>{data?.totalRecords ?? 0}</strong><small>Facturas de prueba generadas desde ventas nuevas</small></div><div className="metric-card"><span>Cola preparada</span><strong>{data?.submissionQueue?.blocked ?? 0}</strong><small>Registros bloqueados, sin comunicación AEAT</small></div><div className="metric-card"><span>Certificado</span><strong>{profile?.certificateStatus === "verified" ? "Verificado" : "Pendiente"}</strong><small>No se ha configurado ningún certificado en esta fase</small></div><div className="metric-card"><span>Remisión AEAT</span><strong>No activa</strong><small>Se habilitará solo tras validación final</small></div></div><div className="admin-columns"><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">EMISOR</span><h2>Perfil fiscal de pruebas</h2></div><a className="secondary-button secondary-button--small" href="/api/admin/fiscal/export" download="verifactu-preparation.json">Exportar registros</a></div>{profile ? <div className="fiscal-profile"><strong>{profile.commercialName}</strong><span>{profile.legalName} · NIF {profile.taxId}</span><span>{profile.addressLine1}, {profile.postalCode} {profile.city}</span><small>{profile.softwareName} · {profile.softwareVersion}</small></div> : <div className="admin-empty">El perfil se creará con la primera venta emitida en modo de pruebas.</div>}</section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">INTEGRIDAD</span><h2>Cadena de registros</h2></div></div><p className="helper-text">Comprueba que cada huella SHA-256 referencia correctamente al registro anterior almacenado.</p><button className="primary-button" disabled={verifying || !data?.totalRecords} onClick={onVerify}>{verifying ? "Comprobando…" : "Verificar cadena SHA-256"}</button><small className="helper-text">Las acciones de anulación y rectificación crean nuevos registros. Nunca se edita ni se borra el registro original.</small></section></div><section className="admin-card admin-table-card"><div className="admin-card__header"><div><span className="eyebrow">TRAZABILIDAD</span><h2>Últimos registros fiscales de pruebas</h2></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Factura</th><th>Posición</th><th>Total</th><th>Hash SHA-256</th><th>Anterior</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{data?.records.map((record) => <tr key={record.id}><td><strong>{record.invoiceNumber}</strong><small className="table-subtext">{new Date(record.generatedAt).toLocaleString("es-ES")}</small></td><td>{record.chainPosition}</td><td className="table-money">{euro.format(Number(record.totalAmount))}</td><td><code className="hash-code">{record.recordHash.slice(0, 16)}…</code></td><td><code className="hash-code">{record.previousHash ? `${record.previousHash.slice(0, 12)}…` : "Inicio"}</code></td><td><span className="table-status table-status--warning">{record.submissionStatus}</span></td><td>{record.recordType === "high" && <div className="table-actions"><button className="secondary-button secondary-button--small" disabled={correcting} onClick={() => onRectify(record.fiscalInvoiceId, Number(record.totalAmount))}>Rectificar</button><button className="table-icon-button table-icon-button--danger" disabled={correcting} onClick={() => onCancel(record.fiscalInvoiceId)} title="Anular registro">×</button></div>}</td></tr>)}</tbody></table>{!data?.records.length && <div className="admin-empty">Aún no hay registros de pruebas. Se generarán solo en ventas nuevas tras aplicar la migración.</div>}</div></section></div>;
}

function ProductFilters({ categories, category, onCategory, stock, onStock, sort, onSort }: { categories: Category[]; category: string; onCategory: (value: string) => void; stock: "all" | "low" | "empty"; onStock: (value: "all" | "low" | "empty") => void; sort: "name" | "price" | "stock" | "sold" | "cost" | "family"; onSort: (value: "name" | "price" | "stock" | "sold" | "cost" | "family") => void }) {
  return <div className="table-filters" aria-label="Filtros de artículos"><label>Familia<select value={category} onChange={(event) => onCategory(event.target.value)}><option value="all">Todas las familias</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Stock<select value={stock} onChange={(event) => onStock(event.target.value as "all" | "low" | "empty")}><option value="all">Todos</option><option value="low">Stock bajo</option><option value="empty">Sin stock</option></select></label><label>Ordenar por<select value={sort} onChange={(event) => onSort(event.target.value as "name" | "price" | "stock" | "sold" | "cost" | "family")}><option value="name">Nombre A–Z</option><option value="price">Precio de venta</option><option value="cost">Coste medio</option><option value="stock">Stock disponible</option><option value="sold">Más vendidos</option><option value="family">Familia</option></select></label></div>;
}

function ReportsPanel({ data, period, setPeriod, from, setFrom, to, setTo, source, setSource, group, setGroup, metric, setMetric, isLoading }: { data?: ReportsData; period: string; setPeriod: (value: string) => void; from: string; setFrom: (value: string) => void; to: string; setTo: (value: string) => void; source: "all" | "loyverse" | "local"; setSource: (value: "all" | "loyverse" | "local") => void; group: "auto" | "hour" | "day" | "week" | "month"; setGroup: (value: "auto" | "hour" | "day" | "week" | "month") => void; metric: "total" | "tickets" | "cash" | "card" | "cost" | "margin"; setMetric: (value: "total" | "tickets" | "cash" | "card" | "cost" | "margin") => void; isLoading: boolean }) {
  const totals = data?.totals ?? { totalSold: "0", subtotal: "0", vat: "0", cash: "0", card: "0", cost: "0", margin: "0", tickets: 0 };
  const series = data?.series ?? [];
  const metricLabels = { total: "Ventas", tickets: "Tickets", cash: "Efectivo", card: "Tarjeta", cost: "Coste", margin: "Margen" } as const;
  const groupLabels = { hour: "Horas", day: "Días", week: "Semanas", month: "Meses" } as const;
  const effectiveGroup = data?.group ?? (period === "day" ? "hour" : period === "week" ? "day" : "month");
  const metricValue = (item: ReportsData["series"][number]) => metric === "tickets" ? item.tickets : Number(item[metric] ?? 0);
  const formatMetricValue = (value: number) => metric === "tickets" ? `${value.toLocaleString("es-ES")} tickets` : euro.format(value);
  const formatSeriesLabel = (label: string) => { if (/^\d{2}:\d{2}$/.test(label)) return label; if (/^\d{4}-\d{2}$/.test(label)) { const [year, month] = label.split("-"); return `${month}/${year.slice(2)}`; } if (/^\d{4}-\d{2}-\d{2}$/.test(label)) { const [, month, day] = label.split("-"); return `${day}/${month}`; } return label; };
  const maxSeries = Math.max(...series.map(metricValue), 1);
  const averageTicket = totals.tickets ? Number(totals.totalSold) / totals.tickets : 0;
  const marginPercent = Number(totals.totalSold) ? (Number(totals.margin) / Number(totals.totalSold)) * 100 : 0;
  const [productFilter, setProductFilter] = useState("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const visibleProducts = (data?.topProducts ?? []).filter((item) => productFilter === "all" || item.productName === productFilter);
  const visibleFamilies = (data?.byFamily ?? []).filter((item) => familyFilter === "all" || item.family === familyFilter);
  const maxFamilyRevenue = Math.max(...(visibleFamilies.length ? visibleFamilies : (data?.byFamily ?? [])).map((item) => Number(item.revenue)), 1);
  return <div className="admin-page reports-page">
    <div className="admin-page-header"><div><span className="eyebrow">ANÁLISIS HISTÓRICO</span><h2>Informes de ventas</h2><p>Consulta ventas, cobros, IVA, costes y margen por jornada comercial de 07:00 a 07:00. Los años nuevos aparecerán automáticamente cuando existan datos.</p></div></div>
    <section className="admin-card report-filters"><div className="report-filter-group"><label>Periodo<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="day">Hoy</option><option value="week">Esta semana</option><option value="month">Este mes</option><option value="quarter">Este trimestre</option><option value="year">Este año</option><option value="custom">Rango personalizado</option></select></label><label>Agrupar por<select value={group} onChange={(event) => setGroup(event.target.value as "auto" | "hour" | "day" | "week" | "month")}><option value="auto">Automático · {groupLabels[effectiveGroup]}</option><option value="hour">Horas · 07:00 → última venta</option><option value="day">Días</option><option value="week">Semanas</option><option value="month">Meses</option></select></label><label>Mostrar<select value={metric} onChange={(event) => setMetric(event.target.value as "total" | "tickets" | "cash" | "card" | "cost" | "margin")}><option value="total">Ventas</option><option value="tickets">Número de tickets</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="cost">Coste</option><option value="margin">Margen</option></select></label><label>Origen<select value={source} onChange={(event) => setSource(event.target.value as "all" | "loyverse" | "local")}><option value="all">Loyverse + TPV local</option><option value="loyverse">Solo Loyverse</option><option value="local">Solo TPV local</option></select></label><label>Familia<select value={familyFilter} onChange={(event) => setFamilyFilter(event.target.value)}><option value="all">Todas las familias</option>{(data?.byFamily ?? []).map((item) => <option value={item.family} key={item.family}>{item.family}</option>)}</select></label><label>Artículo<select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="all">Todos los artículos</option>{(data?.topProducts ?? []).map((item) => <option value={item.productName} key={item.productName}>{item.productName}</option>)}</select></label>{period === "custom" && <><label>Desde<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Hasta<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></>}</div><div className="report-period-label">{data ? `${data.from} → ${data.to}` : "Cargando periodo…"}</div></section>
    {isLoading ? <div className="admin-card admin-empty">Calculando informe…</div> : <>
      <div className="metric-grid report-metrics"><div className="metric-card metric-card--accent"><span>Total vendido</span><strong>{euro.format(Number(totals.totalSold))}</strong><small>{totals.tickets} tickets completados</small></div><div className="metric-card"><span>Ticket medio</span><strong>{euro.format(averageTicket)}</strong><small>Venta media por ticket</small></div><div className="metric-card"><span>Efectivo</span><strong>{euro.format(Number(totals.cash))}</strong><small>{Number(totals.totalSold) ? `${((Number(totals.cash) / Number(totals.totalSold)) * 100).toFixed(1)} % del total` : "0 % del total"}</small></div><div className="metric-card"><span>Tarjeta</span><strong>{euro.format(Number(totals.card))}</strong><small>{Number(totals.totalSold) ? `${((Number(totals.card) / Number(totals.totalSold)) * 100).toFixed(1)} % del total` : "0 % del total"}</small></div><div className="metric-card"><span>IVA</span><strong>{euro.format(Number(totals.vat))}</strong><small>IVA repercutido en ventas</small></div><div className="metric-card"><span>Coste</span><strong>{euro.format(Number(totals.cost))}</strong><small>Coste de artículos vendidos</small></div><div className="metric-card metric-card--accent"><span>Margen bruto</span><strong>{euro.format(Number(totals.margin))}</strong><small>{marginPercent.toFixed(1)} % sobre ventas</small></div></div>
      <section className="admin-card report-chart-card"><div className="admin-card__header"><div><span className="eyebrow">EVOLUCIÓN · {groupLabels[effectiveGroup]}</span><h2>{metricLabels[metric]} por {groupLabels[effectiveGroup].toLowerCase()}</h2></div><span className="chart-caption">{effectiveGroup === "hour" ? "Jornada comercial 07:00–07:00" : "Periodo seleccionado"}</span></div>{series.length === 0 ? <div className="admin-empty">No hay ventas en el periodo seleccionado.</div> : <div className="report-bars">{series.map((item) => { const value = metricValue(item); return <div className="report-bar-column" key={item.label} title={`${item.label}: ${formatMetricValue(value)}`}><strong>{formatMetricValue(value)}</strong><div className="report-bar-track"><div className="report-bar-fill" style={{ height: `${Math.max(5, (value / maxSeries) * 100)}%` }} /></div><small>{formatSeriesLabel(item.label)}</small><span>{item.tickets} tickets</span></div>; })}</div>}</section>
      <section className="admin-card report-chart-card"><div className="admin-card__header"><div><span className="eyebrow">FAMILIAS</span><h2>Ingresos por familia</h2></div><span className="chart-caption">Comparativa del periodo</span></div>{visibleFamilies.length === 0 ? <div className="admin-empty">No hay familias en el filtro.</div> : <div className="report-family-bars">{visibleFamilies.slice(0, 12).map((item) => <div className="report-family-bar" key={item.family}><div><strong>{item.family}</strong><span>{euro.format(Number(item.revenue))} · {item.units} ud.</span></div><div className="report-family-bar__track"><div className="report-family-bar__fill" style={{ width: `${Math.max(2, (Number(item.revenue) / maxFamilyRevenue) * 100)}%` }} /></div></div>)}</div>}</section>
      <div className="admin-columns report-columns"><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">ARTÍCULOS</span><h2>Productos más vendidos</h2></div></div><div className="data-table-wrap"><table className="data-table report-table"><thead><tr><th>Artículo</th><th>Unidades</th><th>Ventas</th><th>Coste</th><th>Margen</th></tr></thead><tbody>{visibleProducts.map((item) => <tr key={`${item.productId}-${item.productName}`}><td><strong>{item.productName}</strong></td><td>{item.units}</td><td className="table-money">{euro.format(Number(item.revenue))}</td><td className="table-money">{euro.format(Number(item.cost))}</td><td className="table-money table-money--positive">{euro.format(Number(item.margin))}</td></tr>)}</tbody></table>{!data?.topProducts.length && <div className="admin-empty">No hay artículos vendidos.</div>}</div></section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">FAMILIAS</span><h2>Ventas por familia</h2></div></div><div className="data-table-wrap"><table className="data-table report-table"><thead><tr><th>Familia</th><th>Unidades</th><th>Ventas</th><th>Margen</th></tr></thead><tbody>{visibleFamilies.map((item) => <tr key={item.family}><td><strong>{item.family}</strong></td><td>{item.units}</td><td className="table-money">{euro.format(Number(item.revenue))}</td><td className="table-money table-money--positive">{euro.format(Number(item.margin))}</td></tr>)}</tbody></table>{!data?.byFamily.length && <div className="admin-empty">No hay familias vendidas.</div>}</div></section></div>
      <div className="admin-columns report-columns report-bottom-columns"><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">COBROS</span><h2>Medios de pago</h2></div><span className="chart-caption">Distribución del periodo</span></div><div className="payment-report"><div className="payment-report__track"><div className="payment-report__cash" style={{ width: `${Number(totals.totalSold) ? (Number(totals.cash) / Number(totals.totalSold)) * 100 : 0}%` }} /><div className="payment-report__card" style={{ width: `${Number(totals.totalSold) ? (Number(totals.card) / Number(totals.totalSold)) * 100 : 0}%` }} /></div><div className="payment-report__legend"><span><i className="payment-dot payment-dot--cash" />Efectivo <strong>{euro.format(Number(totals.cash))}</strong></span><span><i className="payment-dot payment-dot--card" />Tarjeta <strong>{euro.format(Number(totals.card))}</strong></span></div></div></section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">RENTABILIDAD</span><h2>Resultado del periodo</h2></div></div><div className="profit-report"><div><span>Ventas</span><strong>{euro.format(Number(totals.totalSold))}</strong></div><div><span>Coste</span><strong>{euro.format(Number(totals.cost))}</strong></div><div className="profit-report__result"><span>Margen bruto</span><strong>{euro.format(Number(totals.margin))}</strong><small>{Number(totals.totalSold) ? `${((Number(totals.margin) / Number(totals.totalSold)) * 100).toFixed(1)} % sobre ventas` : "0 % sobre ventas"}</small></div></div></section></div>
    </>}
  </div>;
}

function LoyversePanel({ status, settings, dashboard, loading, configForm, setConfigForm, savingConfig, onSaveConfig, testingConnection, onTestConnection, restoringCategories, onRestoreCategories, importingCatalog, onImportCatalog, storeId, setStoreId, from, setFrom, to, setTo, syncingCatalog, syncingSales, syncingAll, onSyncCatalog, onSyncSales, onSyncAll }: { status?: LoyverseStatus; settings?: LoyverseSettings; dashboard?: LoyverseDashboard; loading: boolean; configForm: LoyverseConfigForm; setConfigForm: (value: LoyverseConfigForm) => void; savingConfig: boolean; onSaveConfig: () => void; testingConnection: boolean; onTestConnection: () => void; restoringCategories: boolean; onRestoreCategories: () => void; importingCatalog: boolean; onImportCatalog: () => void; storeId: string; setStoreId: (value: string) => void; from: string; setFrom: (value: string) => void; to: string; setTo: (value: string) => void; syncingCatalog: boolean; syncingSales: boolean; syncingAll: boolean; onSyncCatalog: () => void; onSyncSales: () => void; onSyncAll: () => void }) {
  const counts = status?.counts;
  const sales = dashboard?.sales;
  const maxHour = Math.max(...(sales?.byHour ?? []).map((item) => Number(item.total)), 1);
  const loyverseReady = Boolean(status?.configured || settings?.loyverseTokenConfigured);
  return <div className="admin-page loyverse-page"><AdminPageHeader title="Loyverse · lectura" description="Loyverse es el sistema principal. Sweet & Salty POS descarga una copia de consulta del catálogo, stock, imágenes, ventas y turnos sin enviar cambios a Loyverse." /><section className="admin-card loyverse-config-card"><div className="admin-card__header"><div><span className="eyebrow">CONEXIÓN SEGURA</span><h2>Credencial de Loyverse</h2><p className="admin-card__description">Puedes guardarla aquí para no depender de las variables de Plesk. Nunca se muestra el token almacenado.</p></div><span className={settings?.loyverseTokenConfigured ? "table-status table-status--success" : "table-status table-status--warning"}>{settings?.loyverseTokenConfigured ? "Token guardado" : "Sin token"}</span></div><div className="loyverse-config-grid"><label>URL de la API<input value={configForm.apiBaseUrl} onChange={(event) => setConfigForm({ ...configForm, apiBaseUrl: event.target.value })} placeholder="https://api.loyverse.com/v1.0" /></label><label>UUID de tienda (opcional)<input value={configForm.storeId} onChange={(event) => setConfigForm({ ...configForm, storeId: event.target.value })} placeholder="Se seleccionará la primera si se deja vacío" /></label><label className="loyverse-token-field">Token personal<input type="password" autoComplete="new-password" value={configForm.apiToken} onChange={(event) => setConfigForm({ ...configForm, apiToken: event.target.value, clearToken: false })} placeholder={settings?.loyverseTokenConfigured ? "Token guardado · deja vacío para conservarlo" : "Pega aquí el token nuevo"} /></label></div><div className="loyverse-config-actions"><label className="checkbox-label"><input type="checkbox" checked={configForm.clearToken} disabled={!settings?.loyverseTokenConfigured} onChange={(event) => setConfigForm({ ...configForm, clearToken: event.target.checked, apiToken: "" })} /> Eliminar el token guardado</label><div className="loyverse-config-buttons"><button className="secondary-button" disabled={testingConnection || savingConfig || !settings?.loyverseTokenConfigured} onClick={onTestConnection}><Link2 size={15} /> {testingConnection ? "Probando…" : "Probar conexión"}</button><button className="primary-button" disabled={savingConfig || !configForm.apiBaseUrl} onClick={onSaveConfig}><Check size={15} /> {savingConfig ? "Guardando…" : "Guardar conexión"}</button></div></div></section>{!loyverseReady && <div className="notice-card loyverse-notice"><Link2 size={19} /><div><strong>Conexión pendiente</strong><p>Guarda un token nuevo en este panel o añade <code>LOYVERSE_API_TOKEN</code> en las variables del servidor. Los datos ya importados seguirán visibles, pero no se podrá lanzar una nueva sincronización.</p></div></div>}<section className="admin-card loyverse-connection-card"><div className="admin-card__header"><div><span className="eyebrow">ESTADO DE LA INTEGRACIÓN</span><h2>{status?.state?.merchantName || "Cuenta de Loyverse"}</h2><p className="admin-card__description">{status?.state?.activeStoreName ? `Tienda activa: ${status.state.activeStoreName}` : "Todavía no se ha seleccionado una tienda activa."}</p></div><span className={loyverseReady ? "table-status table-status--success" : "table-status table-status--warning"}>{loyverseReady ? "Lista para sincronizar" : "Sin credencial"}</span></div><div className="loyverse-count-grid"><div><PackageOpen size={16} /><strong>{counts?.items ?? 0}</strong><small>Artículos</small></div><div><Folder size={16} /><strong>{counts?.categories ?? 0}</strong><small>Familias</small></div><div><ShoppingBag size={16} /><strong>{counts?.inventoryLevels ?? 0}</strong><small>Niveles de stock</small></div><div><ReceiptText size={16} /><strong>{counts?.receipts ?? 0}</strong><small>Recibos</small></div><div><CalendarDays size={16} /><strong>{counts?.shifts ?? 0}</strong><small>Turnos</small></div></div><div className="loyverse-sync-panel"><div><strong>Actualizar datos de lectura</strong><small>{status?.state?.lastSyncFinishedAt ? `Última sincronización: ${new Date(status.state.lastSyncFinishedAt).toLocaleString("es-ES")}` : "Aún no hay datos descargados."}</small>{status?.state?.lastSyncError && <small className="loyverse-error-text">Último error: {status.state.lastSyncError}</small>}</div><div className="loyverse-sync-actions"><button className="secondary-button" disabled={!loyverseReady || restoringCategories || syncingCatalog || syncingSales || syncingAll || importingCatalog} onClick={onRestoreCategories}><Folder size={15} /> {restoringCategories ? "Restaurando…" : "Restaurar familias locales"}</button><button className="secondary-button" disabled={!loyverseReady || syncingCatalog || syncingSales || syncingAll || importingCatalog} onClick={onSyncCatalog}><CloudDownload size={15} /> {syncingCatalog ? "Descargando…" : "Catálogo y stock"}</button><button className="secondary-button" disabled={!loyverseReady || syncingCatalog || syncingSales || syncingAll || importingCatalog || !(dashboard?.catalog.length)} onClick={onImportCatalog}><PackageOpen size={15} /> {importingCatalog ? "Importando…" : "Sincronizar e importar"}</button><button className="secondary-button" disabled={!loyverseReady || syncingCatalog || syncingSales || syncingAll || importingCatalog} onClick={onSyncSales}><ReceiptText size={15} /> {syncingSales ? "Actualizando ventas…" : "Actualizar ventas últimos 31 días"}</button><button className="primary-button" disabled={!loyverseReady || syncingCatalog || syncingSales || syncingAll || importingCatalog} onClick={onSyncAll}><RefreshCw size={15} /> {syncingAll ? "Sincronizando…" : "Actualizar catálogo + ventas"}</button></div></div></section>{loading && !dashboard ? <div className="admin-card admin-empty">Cargando datos de Loyverse…</div> : <><section className="admin-card loyverse-filters"><div className="admin-card__header"><div><span className="eyebrow">ACTUALIZACIÓN DE VENTAS</span><h2>Últimos 31 días</h2><p className="admin-card__description">No necesitas seleccionar fechas. Cada actualización vuelve a consultar automáticamente los últimos 31 días de Loyverse y actualiza los recibos existentes sin duplicarlos.</p></div></div><div className="loyverse-filter-grid"><label>Tienda<select value={storeId || dashboard?.selectedStoreId || ""} onChange={(event) => setStoreId(event.target.value)}><option value="">Todas las tiendas</option>{(dashboard?.stores ?? []).map((store) => <option value={store.loyverseId} key={store.loyverseId}>{store.name}</option>)}</select></label><div className="loyverse-filter-hint"><Store size={16} /><span>El botón «Actualizar ventas últimos 31 días» procesa el periodo en tramos de hasta 14 días para evitar timeouts.</span></div></div></section>{!dashboard?.catalog.length && !sales?.tickets ? <section className="admin-card admin-empty loyverse-empty"><Image size={22} /><strong>Sin datos importados todavía</strong><span>Configura la credencial y pulsa «Catálogo y stock» o «Actualizar ventas últimos 31 días» para descargar datos de Loyverse.</span></section> : <><div className="metric-grid loyverse-metrics"><div className="metric-card metric-card--accent"><span>Ventas Loyverse</span><strong>{euro.format(Number(sales?.totalSold ?? 0))}</strong><small>{sales?.tickets ?? 0} recibos del periodo</small></div><div className="metric-card"><span>IVA registrado</span><strong>{euro.format(Number(sales?.totalTax ?? 0))}</strong><small>Según recibos importados</small></div><div className="metric-card"><span>Coste estimado</span><strong>{euro.format(Number(sales?.totalCost ?? 0))}</strong><small>Según coste de líneas</small></div><div className="metric-card metric-card--warning"><span>Margen estimado</span><strong>{euro.format(Number(sales?.margin ?? 0))}</strong><small>Venta menos coste importado</small></div></div><div className="admin-columns"><section className="admin-card loyverse-chart-card"><div className="admin-card__header"><div><span className="eyebrow">HORARIOS</span><h2>Ventas por hora</h2></div><span className="chart-caption">Europe/Madrid</span></div><div className="hourly-chart">{(sales?.byHour ?? []).map((bucket) => { const height = Math.max(4, Number(bucket.total) / maxHour * 100); return <div className="hourly-chart__column" key={bucket.hour} title={`${bucket.hour} · ${euro.format(Number(bucket.total))}`}><span className="hourly-chart__value">{Number(bucket.total) > 0 ? euro.format(Number(bucket.total)) : ""}</span><div className="hourly-chart__bar" style={{ height: `${height}%` }} /><small>{bucket.hour} h</small></div>; })}</div>{!(sales?.byHour ?? []).length && <div className="admin-empty">No hay ventas para el periodo seleccionado.</div>}</section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">ARTÍCULOS MÁS VENDIDOS</span><h2>Ranking Loyverse</h2></div></div>{(sales?.topProducts ?? []).length ? <div className="mini-ranking">{sales?.topProducts.slice(0, 8).map((product, index) => <div className="mini-ranking__row" key={product.productName}><b>{String(index + 1).padStart(2, "0")}</b><span>{product.productName}</span><small>{product.units.toLocaleString("es-ES")} ud.</small><strong>{euro.format(Number(product.revenue))}</strong></div>)}</div> : <div className="admin-empty">No hay líneas de venta importadas.</div>}</section></div><section className="admin-card admin-table-card"><div className="admin-card__header"><div><span className="eyebrow">CATÁLOGO IMPORTADO</span><h2>Artículos, precios, stock e imágenes</h2><p className="admin-card__description">Vista de lectura. Los datos proceden de Loyverse y todavía no modifican el catálogo operativo local.</p></div><span className="table-status">{dashboard?.catalog.length ?? 0} artículos</span></div><div className="data-table-wrap"><table className="data-table loyverse-catalog-table"><thead><tr><th></th><th>Artículo</th><th>Familia</th><th>SKU / código</th><th>Precio</th><th>Coste</th><th>Stock</th><th>Variantes</th><th>Estado</th></tr></thead><tbody>{dashboard?.catalog.slice(0, 500).map((item) => <tr key={item.id}><td>{item.imageUrl ? <img className="loyverse-image-thumb" src={item.imageUrl} alt="" loading="lazy" /> : <span className="loyverse-image-placeholder"><Image size={15} /></span>}</td><td><strong>{item.name}</strong><small className="table-subtext">{item.id}</small></td><td>{item.category}</td><td><small>{item.sku || "—"}</small><small className="table-subtext">{item.barcode || "Sin código"}</small></td><td className="table-money">{item.price === null || item.price === undefined ? "—" : euro.format(Number(item.price))}</td><td className="table-money">{item.cost === null || item.cost === undefined || Number(item.cost) <= 0 ? <span className="table-subtext">No informado</span> : euro.format(Number(item.cost))}</td><td className={Number(item.stock) <= 0 ? "table-money table-money--negative" : "table-money"}>{Number(item.stock).toLocaleString("es-ES")}</td><td>{item.variants}</td><td><span className={item.deleted || !item.availableForSale ? "table-status table-status--warning" : "table-status table-status--success"}>{item.deleted ? "Eliminado" : item.availableForSale ? "Disponible" : "No disponible"}</span></td></tr>)}</tbody></table></div></section><section className="admin-card admin-table-card"><div className="admin-card__header"><div><span className="eyebrow">RECIBOS IMPORTADOS</span><h2>Ventas de Loyverse</h2><p className="admin-card__description">Consulta de tickets importados, independiente del registro de ventas y de la caja de Sweet &amp; Salty POS.</p></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Recibo</th><th>Fecha</th><th>Tipo</th><th>Total</th><th>IVA</th><th>Descuento</th></tr></thead><tbody>{sales?.recentReceipts.slice(0, 100).map((receipt) => <tr key={receipt.id}><td><strong>{receipt.receiptNumber}</strong></td><td>{receipt.receiptDate ? new Date(receipt.receiptDate).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "—"}</td><td>{receipt.receiptType || "Venta"}</td><td className="table-money">{euro.format(Number(receipt.totalMoney))}</td><td className="table-money">{euro.format(Number(receipt.totalTax))}</td><td className="table-money">{euro.format(Number(receipt.totalDiscount))}</td></tr>)}</tbody></table></div></section></>}</>}</div>;
}
