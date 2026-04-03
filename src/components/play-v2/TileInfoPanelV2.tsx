import type { BoardTile } from "@/lib/boardPacks";

type InlandDevelopedSiteInfo = {
  name: string;
  ownerLabel: string;
  passiveIncomeLabel: string;
  perks: string[];
  locationLabel: string;
};

type TileInfoPanelV2Props = {
  tile?: BoardTile | null;
  bandColor?: string;
  ownerLabel?: string;
  statusLabel?: string;
  purchasePriceLabel?: string;
  currentRentLabel?: string;
  upgradeCostLabel?: string | null;
  nextRentLabel?: string | null;
  isFullyUpgraded?: boolean;
  onViewTitleCard?: () => void;
  inlandSiteInfo?: InlandDevelopedSiteInfo | null;
};

const StatRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-3 text-xs">
    <span className="font-medium uppercase tracking-wide text-white/55">
      {label}
    </span>
    <span className="text-right font-semibold text-white">{value}</span>
  </div>
);

export default function TileInfoPanelV2({
  tile,
  bandColor,
  ownerLabel,
  statusLabel,
  purchasePriceLabel,
  currentRentLabel,
  upgradeCostLabel,
  nextRentLabel,
  isFullyUpgraded,
  onViewTitleCard,
  inlandSiteInfo,
}: TileInfoPanelV2Props) {
  if (inlandSiteInfo) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-white/15 bg-neutral-900/90 px-3 py-3">
        <div
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: "#38bdf8" }}
        />
        <div className="pl-2">
          <p className="text-sm font-semibold text-white">{inlandSiteInfo.name}</p>
          <div className="mt-2 space-y-1.5">
            <StatRow label="Type" value="Developed inland site" />
            <StatRow label="Owner" value={inlandSiteInfo.ownerLabel} />
            <StatRow label="Passive income" value={inlandSiteInfo.passiveIncomeLabel} />
          </div>
          <div className="mt-2 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
              Perks & synergy
            </p>
            {inlandSiteInfo.perks.length > 0 ? (
              <ul className="space-y-1.5 text-xs text-white/85">
                {inlandSiteInfo.perks.map((perk) => (
                  <li key={perk} className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
                    {perk}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-white/70">No extra perk metadata is available yet.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!tile) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/15 bg-neutral-900/90 px-3 py-3">
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: bandColor ?? "#737373" }}
      />
      <div className="pl-2">
        <p className="text-sm font-semibold text-white">{tile.name}</p>
        <div className="mt-2 space-y-1.5">
          <StatRow label="Purchase price" value={purchasePriceLabel ?? "—"} />
          <StatRow label="Owner" value={ownerLabel ?? "—"} />
          <StatRow label="Status" value={statusLabel ?? "—"} />
          <StatRow label="Current rent" value={currentRentLabel ?? "—"} />
          {upgradeCostLabel ? (
            <StatRow label="Upgrade cost" value={upgradeCostLabel} />
          ) : null}
          {nextRentLabel ? <StatRow label="Next rent" value={nextRentLabel} /> : null}
          {upgradeCostLabel && isFullyUpgraded ? (
            <p className="pt-0.5 text-right text-[11px] font-semibold uppercase tracking-wide text-emerald-300/90">
              Fully upgraded
            </p>
          ) : null}
        </div>
        {onViewTitleCard ? (
          <button
            type="button"
            onClick={onViewTitleCard}
            className="mt-3 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
          >
            View title card
          </button>
        ) : null}
      </div>
    </div>
  );
}
