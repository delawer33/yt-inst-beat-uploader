import { useParams } from "react-router";

export function BeatPage() {
  const { id } = useParams();
  return <h1 className="text-2xl font-semibold">Beat {id}</h1>;
}
