/**
 * Exportación a Excel (.xlsx) 100% en el cliente con SheetJS.
 * Cada página de reportes arma sus filas (las claves de cada objeto son los
 * encabezados de columna — construirlas con t() para que el Excel salga en el
 * idioma activo) y llama descargarExcel('archivo', [{ nombre, filas }, ...]).
 * El import es dinámico para no engordar el bundle inicial del panel.
 */

export interface HojaExcel {
  nombre: string;
  filas: Array<Record<string, string | number | null>>;
}

export async function descargarExcel(archivo: string, hojas: HojaExcel[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const h of hojas) {
    const ws = XLSX.utils.json_to_sheet(h.filas);
    // Excel limita el nombre de hoja a 31 caracteres
    XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31));
  }
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${archivo}-${fecha}.xlsx`);
}
