/**
 * PanicModal (T13, generalizado en hardening v0.2.0)
 *
 * Wrapper delgado de ConfirmModal con los strings del boton de panico.
 * Toda la mecanica (alertdialog centrado, focus trap, anti doble-tap,
 * Escape/overlay cancelan) vive en ConfirmModal — ver ese archivo.
 *
 * Restaurar el foco al trigger al cerrar es responsabilidad del padre
 * (PanicButton guarda el ref del boton disparador).
 *
 * Props: { open, onConfirm, onCancel } — controlado, presentacional.
 */
import ConfirmModal from './ConfirmModal.jsx'
import { useT } from '../hooks/useT.js'

export default function PanicModal({ open, onConfirm, onCancel }) {
  const { t } = useT()
  return (
    <ConfirmModal
      open={open}
      variant="danger"
      title={t('panic.confirmTitle')}
      message={
        <>
          <p>{t('panic.confirmBody')}</p>
          <p className="font-semibold text-ink-1">{t('panic.confirmScope')}</p>
        </>
      }
      confirmLabel={t('panic.confirmCta')}
      cancelLabel={t('common.cancel')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
