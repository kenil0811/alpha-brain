/** A skill's or pipeline's steps as sentences a person reads; the script of a reader stays a
 *  script. Nothing here is editable: a change is asked of Alpha. */
export function stepSentence(step: Record<string, unknown>): string {
  const s = step as Record<string, string | undefined>;
  if (s.read) return `Read ${s.read} into ${s.into ?? "its table"}${s.key ? `, matched on ${s.key}` : ""}`;
  if (s.tell) return `Tell what changed in ${s.tell}`;
  if (s.run) return `Run the steps of ${s.run}`;
  if (s.goto) return `Go to ${s.goto}`;
  if (s.click_text) return `Click “${s.click_text}”`;
  if (s.click) return `Click ${s.click}`;
  if (s.fill) return `Fill ${s.fill} with ${s.value ?? ""}`;
  if (s.type) return `Type ${s.value ?? ""} into ${s.type}`;
  if (s.upload) return `Attach the file ${s.value ?? ""} at ${s.upload}`;
  if (s.press) return `Press ${s.press}`;
  if (s.wait_ms) return `Wait ${s.wait_ms} ms`;
  if (s.wait) return `Wait for ${s.wait}`;
  if (s.expect_text) return `Expect to see “${s.expect_text}”`;
  if (s.expect) return `Expect ${s.expect}`;
  return JSON.stringify(step);
}
