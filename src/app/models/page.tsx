import { redirect } from "next/navigation";

// Not part of the Agent Hub screens; managed in the database or by administrators.
export default function Removed() {
  redirect("/");
}
