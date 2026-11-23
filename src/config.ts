/* Las URL base no se escriben en el bundle: vienen de config.js, que nginx
   genera al arrancar. Así la MISMA imagen sirve en local y en AWS sin rebuild. */
type RuntimeConfig = {
  pagos?: string
  recomendaciones?: string
  admin?: string
  ws?: string
}

declare global {
  interface Window {
    PEDIDOS360_CONFIG?: RuntimeConfig
  }
}

const cfg: RuntimeConfig = window.PEDIDOS360_CONFIG ?? {}

export const API = {
  pagos: cfg.pagos ?? 'http://localhost:8083',
  recomendaciones: cfg.recomendaciones ?? 'http://localhost:8084',
  admin: cfg.admin ?? 'http://localhost:8085',
}

export const WS_URL = cfg.ws ?? ''
