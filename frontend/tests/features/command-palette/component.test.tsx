import React from "react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CommandPalette } from "../../../src/components/commandPalette/CommandPalette";
import { scope, assets } from "./fixtures";
const state=vi.hoisted(()=>({push:vi.fn(),session:{isConnected:true,address:"0xabc",family:"evm",chainId:1,stellar:{network:"stellar-testnet"}}}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:state.push})}));
vi.mock("@/providers/WalletSessionProvider",()=>({useWalletSessionContext:()=>state.session}));
vi.mock("next/dynamic",async()=>{
  const {CommandPalette: Palette}=await import("../../../src/components/commandPalette/CommandPalette");
  return {default:()=>Palette};
});
import { CommandTrigger } from "../../../src/components/commandPalette/CommandTrigger";
beforeEach(()=>{
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};
  state.session={isConnected:true,address:"0xabc",family:"evm",chainId:1,stellar:{network:"stellar-testnet"}};
});
afterEach(()=>cleanup());
it("supports keyboard selection, focus trapping, escape and focus restoration",()=>{
  const opener=document.createElement("button");document.body.append(opener);opener.focus();
  const close=vi.fn(),navigate=vi.fn();
  const view=render(<CommandPalette open scope={scope} assets={assets} close={close} navigate={navigate}/>);
  const search=screen.getByRole("combobox");expect(document.activeElement).toBe(search);
  fireEvent.change(search,{target:{value:"scan"}});fireEvent.keyDown(search,{key:"Enter"});
  expect(navigate).toHaveBeenCalledWith("/scan");expect(close).toHaveBeenCalled();
  fireEvent.keyDown(search,{key:"Tab",shiftKey:true});expect(document.activeElement).toBe(screen.getByRole("button",{name:"Close search"}));
  fireEvent.keyDown(document.activeElement!,{key:"Tab"});expect(document.activeElement).toBe(search);
  fireEvent.keyDown(search,{key:"Escape"});expect(close).toHaveBeenCalledTimes(2);
  view.unmount();expect(document.activeElement).toBe(opener);opener.remove();
});
it("keeps IME Enter inert and announces an empty result without an active descendant",()=>{
  const navigate=vi.fn();render(<CommandPalette open scope={scope} assets={assets} close={()=>{}} navigate={navigate}/>);
  const search=screen.getByRole("combobox");
  fireEvent.keyDown(search,{key:"Enter",isComposing:true});expect(navigate).not.toHaveBeenCalled();
  fireEvent.change(search,{target:{value:"no match zzz"}});
  expect(screen.getAllByText("No matching pages or session assets.").length).toBeGreaterThan(0);
  expect(search.getAttribute("aria-activedescendant")).toBeNull();
});
it("shows only owned assets and retains recent selection across close/reopen",()=>{
  const props={scope,assets,close:()=>{},navigate:()=>{}};
  const view=render(<CommandPalette open {...props}/>);
  const input=screen.getByRole("combobox");fireEvent.change(input,{target:{value:"history"}});fireEvent.keyDown(input,{key:"Enter"});
  fireEvent.change(input,{target:{value:""}});
  view.rerender(<CommandPalette open={false} {...props}/>);view.rerender(<CommandPalette open {...props}/>);
  expect(screen.getAllByRole("option")[0].textContent).toContain("History");
  fireEvent.change(input,{target:{value:"USD"}});expect(screen.getAllByRole("option")).toHaveLength(2);
  expect(screen.queryByText(/Public network/)).toBeNull();expect(screen.queryByText(/PRIVATE/)).toBeNull();
});
it("mounts from the trigger and clears query/modal on wallet or network switch",()=>{
  const view=render(<CommandTrigger/>);const trigger=screen.getByRole("button",{name:"Search"});
  trigger.focus();fireEvent.click(trigger);fireEvent.change(screen.getByRole("combobox"),{target:{value:"privatequery"}});
  state.session={...state.session,chainId:2};view.rerender(<CommandTrigger/>);
  expect(screen.queryByRole("dialog")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Search"}));
  expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
  state.session={...state.session,isConnected:false};view.rerender(<CommandTrigger/>);expect(screen.queryByRole("dialog")).toBeNull();
});
