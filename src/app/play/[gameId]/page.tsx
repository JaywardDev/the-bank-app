import { redirect } from "next/navigation";
import LegacyPlayPage from "../page";

type LegacyPlayRoutePageProps = {
  params: Promise<{ gameId: string }>;
  searchParams?: Promise<{ legacy?: string }>;
};

export default async function LegacyPlayRoutePage({
  params,
  searchParams,
}: LegacyPlayRoutePageProps) {
  const { gameId } = await params;
  const resolvedSearchParams = await searchParams;

  if (resolvedSearchParams?.legacy !== "1") {
    redirect(`/play-v2/${gameId}`);
  }

  return <LegacyPlayPage />;
}
