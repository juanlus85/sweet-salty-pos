import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { 
  LayoutDashboard, 
  LogOut, 
  PanelLeft, 
  Calendar, 
  Wallet, 
  Receipt, 
  Package, 
  AlertTriangle, 
  CheckSquare,
  Users,
  Building2,
  Store,
  Truck,
  FileArchive,
  Settings,
  Sparkles,
  DollarSign,
  BarChart3,
  Vault,
  Key,
  History,
  ShoppingCart,
  ClipboardList,
  Sandwich
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState, createContext, useContext } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { NotificationBell } from "./NotificationBell";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Calendar, label: "Turnos", path: "/turnos" },
  { icon: Wallet, label: "Caja", path: "/caja" },
  { icon: Receipt, label: "Facturas", path: "/facturas" },
  { icon: DollarSign, label: "Gastos/Ingresos", path: "/otros-gastos", adminOnly: true },
  { icon: ShoppingCart, label: "Pedidos", path: "/pedidos", adminOnly: true },
  { icon: ClipboardList, label: "Check-in", path: "/checkin", staffOnly: true },
  { icon: Package, label: "Inventario", path: "/inventario" },
  { icon: AlertTriangle, label: "Incidencias", path: "/incidencias" },
  { icon: CheckSquare, label: "Tareas", path: "/tareas" },
  { icon: Sparkles, label: "Housekeeping", path: "/housekeeping" },
];

const housekeepingMenuItems = [
  { icon: Calendar, label: "Turnos", path: "/turnos" },
  { icon: CheckSquare, label: "Tareas", path: "/tareas" },
  { icon: AlertTriangle, label: "Incidencias", path: "/incidencias" },
  { icon: Package, label: "Inventario", path: "/inventario" },
  { icon: LayoutDashboard, label: "Housekeeping", path: "/housekeeping" },
];

const adminMenuItems = [
  { icon: BarChart3, label: "Resumen Semanal", path: "/resumen-semanal" },
  { icon: History, label: "Histórico de Cajas", path: "/historico-cajas" },
  { icon: Vault, label: "Cajas F", path: "/cajas-f" },
  { icon: Users, label: "Empleados", path: "/empleados" },
  { icon: Truck, label: "Proveedores", path: "/proveedores" },
  { icon: FileArchive, label: "Cierre Trimestral", path: "/cierre-trimestral" },
  { icon: Settings, label: "Configuracion", path: "/configuracion" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

// Business selector context

type BusinessContextType = {
  selectedBusiness: "hostel" | "tienda" | "all";
  setSelectedBusiness: (business: "hostel" | "tienda" | "all") => void;
};

export const BusinessContext = createContext<BusinessContextType>({
  selectedBusiness: "hostel",
  setSelectedBusiness: () => {},
});

export const useBusinessContext = () => useContext(BusinessContext);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const [selectedBusiness, setSelectedBusiness] = useState<"hostel" | "tienda" | "all">(() => {
    const saved = localStorage.getItem("selected-business");
    return (saved as "hostel" | "tienda" | "all") || "hostel";
  });
  const { loading, user } = useAuth();
  
  // Login form state - MUST be before any conditional returns
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
    onError: (error) => {
      toast.error(error.message || "Error al iniciar sesión");
    },
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem("selected-business", selectedBusiness);
  }, [selectedBusiness]);
  
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword) {
      toast.error("Introduce usuario y contraseña");
      return;
    }
    loginMutation.mutate({ username: loginUsername.trim(), password: loginPassword });
  };

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 mb-2">
              <Building2 className="h-10 w-10 text-primary" />
              <Store className="h-10 w-10 text-secondary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-center">
              The Spot Central & Sweet & Salty
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Sistema de gestión integral. Inicia sesión para continuar.
            </p>
          </div>
          <form onSubmit={handleLogin} className="w-full space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Tu nombre de usuario"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Tu contraseña"
                autoComplete="current-password"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full shadow-lg hover:shadow-xl transition-all bg-primary hover:bg-primary/90"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Iniciando sesión..." : "Iniciar sesión"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <BusinessContext.Provider value={{ selectedBusiness, setSelectedBusiness }}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": `${sidebarWidth}px`,
          } as CSSProperties
        }
      >
        <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
          {children}
        </DashboardLayoutContent>
      </SidebarProvider>
    </BusinessContext.Provider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = [...menuItems, ...adminMenuItems, ...housekeepingMenuItems].find(item => item.path === location);
  const isMobile = useIsMobile();
  const { selectedBusiness, setSelectedBusiness } = useBusinessContext();
  const isAdmin = user?.role === "admin";
  const isHousekeeping = user?.role === "housekeeping";
  const isEmployee = user?.role === "user";
  // Housekeeping solo ve su menú específico
  // Admin ve menú completo + opciones admin
  // Employee (user) ve menú completo sin opciones adminOnly pero sí staffOnly
  // Otros roles no ven ni adminOnly ni staffOnly
  const currentMenuItems = isHousekeeping 
    ? housekeepingMenuItems 
    : isAdmin
    ? [...menuItems, ...adminMenuItems]
    : isEmployee
    ? menuItems.filter(item => !item.adminOnly)
    : menuItems.filter(item => !item.adminOnly && !item.staffOnly);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const businessLabel = selectedBusiness === "hostel" ? "Hostel" : selectedBusiness === "tienda" ? "Tienda" : "Ambos";
  const BusinessIcon = selectedBusiness === "hostel" ? Building2 : selectedBusiness === "tienda" ? Store : LayoutDashboard;

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/70" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate text-sidebar-foreground">
                    Gestión
                  </span>
                </div>
              )}
            </div>
          </SidebarHeader>

          {/* Business Selector */}
          {!isCollapsed && (
            <div className="px-3 py-3 border-b border-sidebar-border">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-sidebar-accent hover:bg-sidebar-accent/80 transition-colors text-left">
                    <BusinessIcon className="h-4 w-4 text-sidebar-foreground" />
                    <span className="text-sm font-medium text-sidebar-foreground flex-1">{businessLabel}</span>
                    <Badge variant="outline" className="text-xs bg-sidebar-primary/20 text-sidebar-primary-foreground border-sidebar-primary/30">
                      {selectedBusiness === "all" ? "2" : "1"}
                    </Badge>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onClick={() => setSelectedBusiness("hostel")} className="cursor-pointer">
                    <Building2 className="mr-2 h-4 w-4" />
                    <span>The Spot Hostel</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedBusiness("tienda")} className="cursor-pointer">
                    <Store className="mr-2 h-4 w-4" />
                    <span>Sweet & Salty</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSelectedBusiness("all")} className="cursor-pointer">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    <span>Ver ambos</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <SidebarContent className="gap-0 py-2">
            <SidebarMenu className="px-2">
              {currentMenuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70"}`}
                      />
                      <span className="text-sidebar-foreground">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>


          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-sidebar-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none">
                  <Avatar className="h-9 w-9 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-sidebar-primary text-sidebar-primary-foreground">
                      {user?.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none text-sidebar-foreground">
                      {user?.name || "Usuario"}
                    </p>
                    <p className="text-xs text-sidebar-foreground/60 truncate mt-1">
                      {user?.role === "admin" ? "Administrador" : user?.role === "housekeeping" ? "Housekeeping" : "Empleado"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Cerrar sesión</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Versión v68 · 27/12/2025
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <span className="font-medium text-foreground">
                {activeMenuItem?.label ?? "Gestión"}
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-sm">
                  <BusinessIcon className="h-3.5 w-3.5" />
                  <span>{businessLabel}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSelectedBusiness("hostel")}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Hostel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedBusiness("tienda")}>
                  <Store className="mr-2 h-4 w-4" />
                  Tienda
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSelectedBusiness("all")}>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Ver ambos
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <NotificationBell />
          </div>
        )}
        <main className="flex-1 p-4 md:p-6 bg-muted/30 min-h-screen">{children}</main>
      </SidebarInset>
    </>
  );
}
