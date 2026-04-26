type RentUnavailableIndicatorProps = {
  className?: string;
};

export default function RentUnavailableIndicator({
  className,
}: RentUnavailableIndicatorProps) {
  return (
    <span className={className}>
      <span aria-hidden="true" title="Rent unavailable while collateralized">
        🚫
      </span>
      <span className="sr-only">Rent unavailable while collateralized</span>
    </span>
  );
}
