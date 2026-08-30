/**
 * Deliberately broken layout, used to prove the responsive check works
 * (issue #148).
 *
 * A check that only ever passes says nothing. This fixture reproduces the two
 * failures the check exists to catch — a fixed width wider than the smallest
 * supported viewport, and an interactive control below the minimum touch
 * target — so `responsive-check.ts` can assert it is rejected.
 *
 * It is never rendered by the application, and the check fails if it ever
 * stops being detected.
 */
export function OverflowingFixture() {
  return (
    <div className="w-[1200px]">
      <table className="w-full min-w-[1400px] text-sm">
        <tbody>
          <tr>
            <td>This table is wider than any supported viewport and is not in a scroll region.</td>
          </tr>
        </tbody>
      </table>

      <button type="button" className="h-4 w-4 p-0">
        x
      </button>
    </div>
  );
}

export default OverflowingFixture;
