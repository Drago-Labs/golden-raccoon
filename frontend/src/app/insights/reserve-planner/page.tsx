import { AppShell } from "@/components/AppShell";
import { ReservePlanner } from "@/components/research/reserve-planner/ReservePlanner";

export const metadata = { title: "Reserve planner | Golden Raccoon" };

export default function ReservePlannerPage() {
  return <AppShell><ReservePlanner /></AppShell>;
}
