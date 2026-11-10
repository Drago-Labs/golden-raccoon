import type {
  ContractEventSpecDef,
  EventDecoderDeps,
  RawEventWindowResponse,
} from "@/server/research/event-decoder";

export const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

export function depsFromFixture(fixture: {
  specs: ContractEventSpecDef[];
  window: RawEventWindowResponse;
}): EventDecoderDeps {
  return {
    eventProvider: {
      async readContractEvents() {
        return fixture.window;
      },
    },
    specProvider: {
      async readContractEventSpecs() {
        return fixture.specs;
      },
    },
  };
}
