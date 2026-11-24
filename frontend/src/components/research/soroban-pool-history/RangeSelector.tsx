type RangeSelectorProps = {
  fromLedger: string;
  toLedger: string;
  disabled: boolean;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
};

export function RangeSelector({ fromLedger, toLedger, disabled, onFrom, onTo }: RangeSelectorProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor="fromLedger" className="text-sm font-medium">
          From ledger
        </label>
        <input
          id="fromLedger"
          type="number"
          min={1}
          value={fromLedger}
          onChange={(event) => onFrom(event.target.value)}
          disabled={disabled}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor="toLedger" className="text-sm font-medium">
          To ledger
        </label>
        <input
          id="toLedger"
          type="number"
          min={1}
          value={toLedger}
          onChange={(event) => onTo(event.target.value)}
          disabled={disabled}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>
    </div>
  );
}
