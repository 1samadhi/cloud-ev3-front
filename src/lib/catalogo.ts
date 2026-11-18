/* El catálogo vive en el frontend porque el tópico de interacciones espera
   category y productType, y ms-recomendaciones no expone un endpoint de
   catálogo: sin este mapa habría que inventar las categorías en cada clic. */
export const CATALOGO: Record<string, { categoria: string; tipo: string }> = {
  item_101: { categoria: 'electronica', tipo: 'audio' },
  item_102: { categoria: 'electronica', tipo: 'perifericos' },
  item_103: { categoria: 'ropa', tipo: 'calzado' },
  item_104: { categoria: 'ropa', tipo: 'vestuario' },
  item_105: { categoria: 'hogar', tipo: 'cocina' },
  item_106: { categoria: 'hogar', tipo: 'accesorios' },
  item_107: { categoria: 'electronica', tipo: 'wearables' },
  item_108: { categoria: 'deportes', tipo: 'suplementos' },
  item_109: { categoria: 'electronica', tipo: 'monitores' },
  item_110: { categoria: 'electronica', tipo: 'perifericos' },
  item_111: { categoria: 'electronica', tipo: 'audio' },
  item_112: { categoria: 'electronica', tipo: 'computacion' },
  item_113: { categoria: 'ropa', tipo: 'vestuario' },
  item_114: { categoria: 'ropa', tipo: 'vestuario' },
  item_115: { categoria: 'ropa', tipo: 'accesorios' },
  item_116: { categoria: 'hogar', tipo: 'electrodomesticos' },
  item_117: { categoria: 'hogar', tipo: 'cocina' },
  item_118: { categoria: 'deportes', tipo: 'fitness' },
  item_119: { categoria: 'deportes', tipo: 'ciclismo' },
  item_120: { categoria: 'deportes', tipo: 'fitness' },
}

export const ITEMS = Object.keys(CATALOGO)

export const clasificar = (itemId: string) =>
  CATALOGO[itemId] ?? { categoria: 'general', tipo: 'standard' }

/* Los pesos los aplica el consumidor en ms-recomendaciones; acá solo se
   muestran para que la pantalla explique qué suma cada acción. */
export const ACCIONES = [
  { id: 'view', etiqueta: 'Ver', peso: 1 },
  { id: 'cart', etiqueta: 'Carrito', peso: 2 },
  { id: 'purchase', etiqueta: 'Comprar', peso: 3 },
] as const

export const TARJETAS_PRUEBA = [
  { marca: 'VISA', numero: '4051 8856 0044 6623', cvv: '123', aprueba: true },
  { marca: 'MASTERCARD', numero: '5186 0595 5959 0568', cvv: '123', aprueba: false },
]
