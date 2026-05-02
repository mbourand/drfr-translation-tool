import { useMemo, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router'
import { ArrowLeftIcon } from '../../components/icons/ArrowLeftIcon'
import { ThemeButton } from '../../components/ThemeButton'
import { useBetaReports } from '../../hooks/useBetaReports'
import { TRANSLATION_APP_PAGES } from '../../routes/pages/routes'
import {
  CATEGORY_DISPLAY,
  CATEGORY_KEYS,
  CategoryKey,
  SEVERITY_DISPLAY,
  SEVERITY_KEYS,
  SeverityKey
} from '../../routes/beta-reports/schemas'
import { AddIcon } from '../../components/icons/AddIcon'
import { BetaReportCard } from './BetaReportCard'
import { BetaReportDetail } from './BetaReportDetail'
import { CreateBetaReportModal } from './CreateBetaReportModal'
import { getReportCategory, getReportSeverity } from './reportSelectors'

type StateFilter = 'open' | 'closed'

export const BetaReportsView = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialState = (searchParams.get('state') as StateFilter | null) ?? 'open'
  const [stateFilter, setStateFilter] = useState<StateFilter>(initialState)
  const [categoryFilter, setCategoryFilter] = useState<CategoryKey | 'all'>('all')
  const [severityFilter, setSeverityFilter] = useState<SeverityKey | 'all'>('all')
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  const { data: reports, isPending, isError, error } = useBetaReports(stateFilter)

  const filtered = useMemo(() => {
    if (!reports) return []
    return reports.filter((report) => {
      if (categoryFilter !== 'all' && getReportCategory(report) !== categoryFilter) return false
      if (severityFilter !== 'all' && getReportSeverity(report) !== severityFilter) return false
      return true
    })
  }, [reports, categoryFilter, severityFilter])

  const selected = useMemo(
    () => filtered.find((r) => r.number === selectedNumber) ?? filtered[0] ?? null,
    [filtered, selectedNumber]
  )

  const updateStateFilter = (next: StateFilter) => {
    setStateFilter(next)
    setSelectedNumber(null)
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev)
      updated.set('state', next)
      return updated
    })
  }

  return (
    <main className="h-screen mx-auto max-w-[1700px] w-full flex flex-col gap-4 py-4 px-4">
      <div className="flex flex-row items-center gap-2">
        <NavLink to={TRANSLATION_APP_PAGES.OVERVIEW} className="btn btn-circle btn-ghost">
          <ArrowLeftIcon />
        </NavLink>
        <h1 className="text-3xl font-semibold flex-1">Signalements</h1>
        <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
          <AddIcon />
          Signaler un bug
        </button>
        <ThemeButton />
      </div>

      <div className="flex flex-row gap-2 flex-wrap items-center">
        <div role="tablist" className="tabs tabs-boxed">
          <button
            role="tab"
            className={`tab ${stateFilter === 'open' ? 'tab-active' : ''}`}
            onClick={() => updateStateFilter('open')}
          >
            Ouverts
          </button>
          <button
            role="tab"
            className={`tab ${stateFilter === 'closed' ? 'tab-active' : ''}`}
            onClick={() => updateStateFilter('closed')}
          >
            Fermés
          </button>
        </div>

        <select
          className="select select-sm select-bordered"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as CategoryKey | 'all')}
        >
          <option value="all">Toutes catégories</option>
          {CATEGORY_KEYS.map((key) => (
            <option key={key} value={key}>
              {CATEGORY_DISPLAY[key]}
            </option>
          ))}
        </select>

        <select
          className="select select-sm select-bordered"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as SeverityKey | 'all')}
        >
          <option value="all">Toutes sévérités</option>
          {SEVERITY_KEYS.map((key) => (
            <option key={key} value={key}>
              {SEVERITY_DISPLAY[key]}
            </option>
          ))}
        </select>

        <p className="opacity-60 text-sm ml-auto">
          {filtered.length} signalement{filtered.length > 1 ? 's' : ''}
        </p>
      </div>

      <section className="flex flex-row gap-4 flex-1 overflow-hidden">
        <div className="flex flex-col gap-2 w-96 overflow-auto pr-1">
          {isPending && <p className="opacity-60">Chargement...</p>}
          {isError && <p className="text-error">Erreur: {error?.message}</p>}
          {!isPending && !isError && filtered.length === 0 && <p className="opacity-60">Aucun signalement</p>}
          {filtered.map((report) => (
            <BetaReportCard
              key={report.number}
              report={report}
              isSelected={selected?.number === report.number}
              onClick={() => setSelectedNumber(report.number)}
            />
          ))}
        </div>

        <div className="flex-1 border border-base-200 rounded-box overflow-hidden bg-base-100">
          {selected ? (
            <BetaReportDetail report={selected} />
          ) : (
            <div className="flex items-center justify-center h-full opacity-60">
              <p>Sélectionnez un signalement pour voir les détails</p>
            </div>
          )}
        </div>
      </section>

      {isCreateModalOpen && (
        <CreateBetaReportModal isVisible={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      )}
    </main>
  )
}
