/**
 * Overlay three-dot menu: item order and handler wiring.
 *   npm run test:menu
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { OverlayMenu } = await import("../src/components/OverlayMenu");
type Props = import("../src/components/OverlayMenu").OverlayMenuProps;

function setup(overrides: Partial<Props> = {}) {
  const calls: string[] = [];
  const props: Props = {
    listen: { mic: false, systemAudio: true },
    pinned: true,
    autoAnswer: true,
    privacyOn: true,
    ending: false,
    onToggleMic: () => calls.push("mic"),
    onToggleSystemAudio: () => calls.push("system"),
    onTogglePin: () => calls.push("pin"),
    onAutoAnswerChange: (enabled) => calls.push(`auto:${enabled}`),
    onTogglePrivacy: () => calls.push("privacy"),
    onEndSession: () => calls.push("end"),
    ...overrides,
  };
  return { props, calls, tree: OverlayMenu(props) as ReactElement<{ children?: ReactNode }> };
}

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return text(node.props.children);
  return "";
}

/** Top-level menu entries as [label, element]. */
function items(tree: ReactElement<{ children?: ReactNode }>) {
  const children = ([] as ReactNode[]).concat(tree.props.children).filter(isValidElement);
  return children.map((el) => [text(el).replace(/\s+/g, " ").trim(), el] as const);
}

function item(tree: ReactElement<{ children?: ReactNode }>, label: RegExp) {
  const found = items(tree).find(([name]) => label.test(name));
  assert.ok(found, `menu item ${label} exists`);
  return found[1] as ReactElement<Record<string, unknown>>;
}

describe("overlay menu", () => {
  it("lists Mic, System, Pin, Auto-answer, Privacy, End in that order", () => {
    const { tree } = setup();
    assert.deepEqual(
      items(tree).map(([name]) => name),
      ["Mic off", "System on", "Pin on", "Auto-answer", "Privacy on", "End"],
    );
  });

  it("Privacy sits directly between Auto-answer and End", () => {
    const names = items(setup().tree).map(([name]) => name.split(" ")[0]);
    const privacy = names.indexOf("Privacy");
    assert.equal(names[privacy - 1], "Auto-answer");
    assert.equal(names[privacy + 1], "End");
  });

  it("Privacy invokes only the privacy handler", () => {
    const { tree, calls } = setup();
    (item(tree, /^Privacy/).props.onClick as () => void)();
    assert.deepEqual(calls, ["privacy"]);
  });

  it("Privacy reflects the current state and is announced as a checkable item", () => {
    const on = item(setup({ privacyOn: true }).tree, /^Privacy/);
    assert.equal(on.props.role, "menuitemcheckbox");
    assert.equal(on.props["aria-checked"], true);
    const offTree = setup({ privacyOn: false }).tree;
    const off = item(offTree, /^Privacy/);
    assert.equal(off.props["aria-checked"], false);
    assert.match(text(off), /Privacy off/);
  });

  it("Auto-answer checkbox still toggles through its own handler", () => {
    const { tree, calls } = setup({ autoAnswer: true });
    const label = item(tree, /^Auto-answer/) as ReactElement<{ children?: ReactNode }>;
    const input = ([] as ReactNode[]).concat(label.props.children).find(isValidElement) as ReactElement<{
      checked: boolean;
      onChange: (e: { target: { checked: boolean } }) => void;
    }>;
    assert.equal(input.props.checked, true);
    input.props.onChange({ target: { checked: false } });
    input.props.onChange({ target: { checked: true } });
    assert.deepEqual(calls, ["auto:false", "auto:true"]);
  });

  it("End still ends the session and nothing else", () => {
    const { tree, calls } = setup();
    (item(tree, /^End/).props.onClick as () => void)();
    assert.deepEqual(calls, ["end"]);
  });

  it("End shows progress while ending", () => {
    assert.ok(items(setup({ ending: true }).tree).some(([name]) => name === "Ending…"));
  });

  it("renders valid markup with one menu and six entries", () => {
    const html = renderToStaticMarkup(OverlayMenu(setup().props));
    assert.equal((html.match(/role="menu"/g) || []).length, 1);
    assert.equal((html.match(/role="menuitem(checkbox)?"/g) || []).length, 5);
    assert.equal((html.match(/type="checkbox"/g) || []).length, 1);
    assert.ok(html.indexOf("Auto-answer") < html.indexOf("Privacy") && html.indexOf("Privacy") < html.indexOf("End"));
  });
});
