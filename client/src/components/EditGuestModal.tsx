import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { COUNTRIES, PAYMENT_TYPES } from "@/../../shared/countries";

interface EditGuestModalProps {
  guest: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function EditGuestModal({ guest, open, onOpenChange, onSuccess }: EditGuestModalProps) {
  const [formData, setFormData] = useState({
    // Datos personales
    firstName: "",
    lastName: "",
    nationality: "ESP",
    documentType: "PAS",
    documentNumber: "",
    documentSupport: "",
    gender: "Hombre",
    birthDate: "",
    phone: "",
    email: "",
    
    // Dirección
    street: "",
    city: "",
    province: "",
    postalCode: "",
    country: "ESP",
    
    // Datos de reserva
    reservationNumber: "",
    checkInDate: "",
    checkOutDate: "",
    roomNumber: "",
    roomType: "",
    roomCode: "",
    entranceCode: "",
    numberOfRooms: "1",
    hasInternet: true,
    accommodationType: "S.A. (Solo Aloj.)",
    reservationOrigin: "Booking.com",
    
    // Información de pago
    paymentType: "TRANS",
    paymentDate: "",
    paymentHolder: "Titular de la reserva",
    paymentMethod: "Transferencia Booking",
    amountPaid: "0",
    amountPending: "0",
  });

  // Obtener habitaciones disponibles
  const { data: accessCodes } = trpc.accessCodes.list.useQuery();

  const updateGuestMutation = trpc.checkin.guests.update.useMutation({
    onSuccess: () => {
      toast.success("Huésped actualizado correctamente");
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Cargar datos del huésped cuando se abre el modal
  useEffect(() => {
    if (guest && open) {
      // Calcular fechas por defecto si el huésped dio fecha de llegada
      let defaultCheckIn = guest.checkInDate || "";
      let defaultCheckOut = guest.checkOutDate || "";
      let defaultPaymentDate = guest.paymentDate || "";
      
      if (guest.checkInDate && !guest.checkOutDate) {
        // Si tiene fecha de llegada pero no de salida, calcular +1 día a las 11:00
        const checkInDate = new Date(guest.checkInDate);
        checkInDate.setHours(11, 0, 0, 0);
        defaultCheckIn = checkInDate.toISOString().slice(0, 16);
        
        const checkOutDate = new Date(checkInDate);
        checkOutDate.setDate(checkOutDate.getDate() + 1);
        checkOutDate.setHours(11, 0, 0, 0);
        defaultCheckOut = checkOutDate.toISOString().slice(0, 16);
      }
      
      // Fecha de pago por defecto: fecha del check-in (solo fecha, sin hora)
      if (!defaultPaymentDate && guest.checkInDate) {
        defaultPaymentDate = guest.checkInDate.slice(0, 10); // YYYY-MM-DD
      }
      
      setFormData({
        firstName: guest.firstName || "",
        lastName: guest.lastName || "",
        nationality: guest.nationality || "ESP",
        documentType: guest.documentType || "PAS",
        documentNumber: guest.documentNumber || "",
        documentSupport: guest.documentSupport || "",
        gender: guest.gender || "Hombre",
        birthDate: guest.birthDate || "",
        phone: guest.phone || "",
        email: guest.email || "",
        street: guest.street || "",
        city: guest.city || "",
        province: guest.province || "",
        postalCode: guest.postalCode || "",
        country: guest.country || "ESP",
        reservationNumber: guest.reservationNumber || "",
        checkInDate: defaultCheckIn,
        checkOutDate: defaultCheckOut,
        roomNumber: guest.roomNumber || "",
        roomType: guest.roomType || "",
        roomCode: guest.roomCode || "",
        entranceCode: guest.entranceCode || "",
        numberOfRooms: guest.numberOfRooms?.toString() || "1",
        hasInternet: guest.hasInternet !== false,
        accommodationType: guest.accommodationType || "S.A. (Solo Aloj.)",
        reservationOrigin: guest.reservationOrigin || "Booking.com",
        paymentType: guest.paymentType || "TRANS",
        paymentDate: defaultPaymentDate,
        paymentHolder: guest.paymentHolder || `${guest.firstName} ${guest.lastName}`,
        paymentMethod: guest.paymentMethod || "Transferencia Booking",
        amountPaid: guest.amountPaid?.toString() || "0",
        amountPending: guest.amountPending?.toString() || "0",
      });
    }
  }, [guest, open]);

  // Auto-completar tipo de habitación y códigos al seleccionar habitación
  const handleRoomChange = (roomNumber: string) => {
    const room = accessCodes?.find(r => r.roomNumber === roomNumber);
    if (room) {
      setFormData(prev => ({
        ...prev,
        roomNumber: roomNumber,
        roomType: room.roomType,
        roomCode: room.roomCode || "",
        entranceCode: room.entranceCode || "",
      }));
    } else {
      setFormData(prev => ({ ...prev, roomNumber }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!guest?.id) return;

    // Validar que tipo de habitación esté presente
    if (!formData.roomType) {
      toast.error("El tipo de habitación es obligatorio");
      return;
    }

    // Convertir fechas datetime-local a formato YYYY-MM-DD para la base de datos
    const formatDateForDB = (dateStr: string) => {
      if (!dateStr) return undefined;
      // Si ya está en formato YYYY-MM-DD, devolver tal cual
      if (dateStr.length === 10) return dateStr;
      // Si es datetime-local (YYYY-MM-DDTHH:mm), extraer solo la fecha
      return dateStr.slice(0, 10);
    };
    
    const updateData: any = {
      id: guest.id,
      firstName: formData.firstName,
      lastName: formData.lastName,
      nationality: formData.nationality,
      documentType: formData.documentType,
      documentNumber: formData.documentNumber,
      documentSupport: formData.documentSupport || undefined,
      gender: formData.gender as "Hombre" | "Mujer" | "Otro",
      birthDate: formatDateForDB(formData.birthDate),
      phone: formData.phone,
      email: formData.email,
      street: formData.street,
      city: formData.city,
      province: formData.province,
      postalCode: formData.postalCode,
      country: formData.country,
      reservationNumber: formData.reservationNumber || undefined,
      checkInDate: formatDateForDB(formData.checkInDate),
      checkOutDate: formatDateForDB(formData.checkOutDate),
      roomNumber: formData.roomNumber || undefined,
      roomType: formData.roomType || undefined,
      roomCode: formData.roomCode || undefined,
      entranceCode: formData.entranceCode || undefined,
      numberOfRooms: parseInt(formData.numberOfRooms) || undefined,
      hasInternet: formData.hasInternet,
      accommodationType: formData.accommodationType as any,
      reservationOrigin: formData.reservationOrigin as any,
      paymentType: formData.paymentType as any,
      paymentDate: formatDateForDB(formData.paymentDate),
      paymentHolder: formData.paymentHolder || undefined,
      paymentMethod: formData.paymentMethod || undefined,
      amountPaid: formData.amountPaid || undefined,
      amountPending: formData.amountPending || undefined,
      status: "completed", // Marcar como completado al guardar todos los datos
    };

    await updateGuestMutation.mutateAsync(updateData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Check-in Anticipado</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Datos Personales */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Datos Personales</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">Nombre *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="lastName">Apellidos *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="nationality">Nacionalidad *</Label>
                <Select value={formData.nationality} onValueChange={(v) => setFormData({ ...formData, nationality: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="documentType">Tipo de Documento *</Label>
                <Select value={formData.documentType} onValueChange={(v) => setFormData({ ...formData, documentType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NIF">DNI (NIF)</SelectItem>
                    <SelectItem value="NIE">NIE</SelectItem>
                    <SelectItem value="PAS">Pasaporte</SelectItem>
                    <SelectItem value="OTRO">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="documentNumber">Número de Documento *</Label>
                <Input
                  id="documentNumber"
                  value={formData.documentNumber}
                  onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
                  required
                />
              </div>
              {formData.documentType === "NIF" && (
                <div>
                  <Label htmlFor="documentSupport">Número de Soporte (DNI)</Label>
                  <Input
                    id="documentSupport"
                    value={formData.documentSupport}
                    onChange={(e) => setFormData({ ...formData, documentSupport: e.target.value })}
                    placeholder="Aparece en el frontal del DNI"
                  />
                </div>
              )}
              <div>
                <Label htmlFor="gender">Sexo *</Label>
                <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Hombre</SelectItem>
                    <SelectItem value="female">Mujer</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="birthDate">Fecha de Nacimiento *</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={formData.birthDate}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Teléfono *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>
          </div>

          {/* Dirección */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Dirección</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="street">Calle y Número *</Label>
                <Input
                  id="street"
                  value={formData.street}
                  onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="city">Ciudad *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="province">Provincia</Label>
                <Input
                  id="province"
                  value={formData.province}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="postalCode">Código Postal</Label>
                <Input
                  id="postalCode"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="country">País *</Label>
                <Select value={formData.country} onValueChange={(v) => setFormData({ ...formData, country: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Datos de Reserva */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Datos de Reserva</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reservationNumber">Número de Reserva</Label>
                <Input
                  id="reservationNumber"
                  value={formData.reservationNumber}
                  onChange={(e) => setFormData({ ...formData, reservationNumber: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="reservationOrigin">Origen de Reserva *</Label>
                <Select value={formData.reservationOrigin} onValueChange={(v) => setFormData({ ...formData, reservationOrigin: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Walk In">Walk In</SelectItem>
                    <SelectItem value="Booking.com">Booking.com</SelectItem>
                    <SelectItem value="Airbnb">Airbnb</SelectItem>
                    <SelectItem value="Expedia">Expedia</SelectItem>
                    <SelectItem value="Website">Website</SelectItem>
                    <SelectItem value="Phone">Phone</SelectItem>
                    <SelectItem value="Email">Email</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="checkInDate">Fecha Check-in *</Label>
                <Input
                  id="checkInDate"
                  type="datetime-local"
                  value={formData.checkInDate}
                  onChange={(e) => setFormData({ ...formData, checkInDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="checkOutDate">Fecha Check-out *</Label>
                <Input
                  id="checkOutDate"
                  type="datetime-local"
                  value={formData.checkOutDate}
                  onChange={(e) => setFormData({ ...formData, checkOutDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="roomNumber">Habitación *</Label>
                <Select value={formData.roomNumber} onValueChange={handleRoomChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar habitación" />
                  </SelectTrigger>
                  <SelectContent>
                    {accessCodes?.map((room) => (
                      <SelectItem key={room.id} value={room.roomNumber}>
                        Habitación {room.roomNumber} - {room.roomType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="roomType">Tipo de Habitación *</Label>
                <Input
                  id="roomType"
                  value={formData.roomType}
                  onChange={(e) => setFormData({ ...formData, roomType: e.target.value })}
                  placeholder="Se auto-completa al seleccionar habitación"
                  required
                />
              </div>
              {/* Códigos ocultos - se entregan llaves físicas en recepción */}
              <div>
                <Label htmlFor="accommodationType">Tipo de Alojamiento *</Label>
                <Select value={formData.accommodationType} onValueChange={(v) => setFormData({ ...formData, accommodationType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S.A. (Solo Aloj.)">S.A. (Solo Aloj.)</SelectItem>
                    <SelectItem value="A.D. (Aloj. y Desayuno)">A.D. (Aloj. y Desayuno)</SelectItem>
                    <SelectItem value="M.P. (Media Pensión)">M.P. (Media Pensión)</SelectItem>
                    <SelectItem value="P.C. (Pensión Completa)">P.C. (Pensión Completa)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="numberOfRooms">Número de Habitaciones *</Label>
                <Input
                  id="numberOfRooms"
                  type="number"
                  min="1"
                  value={formData.numberOfRooms}
                  onChange={(e) => setFormData({ ...formData, numberOfRooms: e.target.value })}
                  required
                />
              </div>
            </div>
          </div>

          {/* Información de Pago */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Información de Pago</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="paymentType">Tipo de Pago *</Label>
                <Select value={formData.paymentType} onValueChange={(v) => setFormData({ ...formData, paymentType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map((pt) => (
                      <SelectItem key={pt.code} value={pt.code}>
                        {pt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="paymentDate">Fecha de Pago</Label>
                <Input
                  id="paymentDate"
                  type="date"
                  value={formData.paymentDate}
                  onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="paymentHolder">Titular del Pago</Label>
                <Input
                  id="paymentHolder"
                  value={formData.paymentHolder}
                  onChange={(e) => setFormData({ ...formData, paymentHolder: e.target.value })}
                  placeholder="Titular de la reserva"
                />
              </div>
              <div>
                <Label htmlFor="paymentMethod">Medio de Pago</Label>
                <Input
                  id="paymentMethod"
                  value={formData.paymentMethod}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                  placeholder="Ej: Transferencia Booking"
                />
              </div>
              <div>
                <Label htmlFor="amountPaid">Cantidad Abonada (€)</Label>
                <Input
                  id="amountPaid"
                  type="number"
                  step="0.01"
                  value={formData.amountPaid}
                  onChange={(e) => setFormData({ ...formData, amountPaid: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="amountPending">Cantidad Pendiente (€)</Label>
                <Input
                  id="amountPending"
                  type="number"
                  step="0.01"
                  value={formData.amountPending}
                  onChange={(e) => setFormData({ ...formData, amountPending: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateGuestMutation.isPending}>
              {updateGuestMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
