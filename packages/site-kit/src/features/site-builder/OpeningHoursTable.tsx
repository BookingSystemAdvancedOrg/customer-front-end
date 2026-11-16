import { useLocationInfo } from '../../shared/useLocationInfo'

/**
 * The opening hours block's live content: the chosen location's hours per
 * weekday and the special days ahead (the same rows as OpeningHoursModal).
 */
export function OpeningHoursTable() {
  const { openingHours, specialDays } = useLocationInfo()
  return (
    <>
      <table className="opening-hours-table">
        <tbody>
          {openingHours.map((row) => (
            <tr key={row.days}>
              <th scope="row">{row.days}</th>
              <td>{row.hours}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {specialDays.length > 0 && (
        <>
          <h3 className="opening-hours-special-heading">Avvikande öppettider</h3>
          <table className="opening-hours-table">
            <tbody>
              {specialDays.map((row) => (
                <tr key={row.date}>
                  <th scope="row">{row.label}</th>
                  <td>{row.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
