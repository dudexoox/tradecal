import { Empty } from "@/components/ui";

export default function NotFound() {
  return <Empty title="Not found" body="That page or record doesn't exist." action={{ href: "/", label: "Back to overview" }} />;
}
