import { Block, EventWithTransaction, uint256 } from "./common/deps.ts";
import {
  formatFelt,
  SELECTOR_KEYS,
  MONGO_CONNECTION_STRING,
  ETH_CONTRACT,
  AUTO_RENEW_CONTRACT,
  AR_FINALITY,
  ETH_UPGRADE_A_BLOCK,
} from "./common/constants.ts";

const filter = {
  header: { weak: true },
  events: [
    {
      fromAddress: formatFelt(ETH_CONTRACT),
      keys: [formatFelt(SELECTOR_KEYS.ON_APPROVE)],
      includeTransaction: false,
      includeReceipt: false,
    },
  ],
};

export const config = {
  streamUrl: Deno.env.get("STREAM_URL"),
  startingBlock: Number(Deno.env.get("AR_STARTING_BLOCK")),
  network: "starknet",
  filter,
  finality: AR_FINALITY,
  sinkType: "mongo",
  sinkOptions: {
    connectionString: MONGO_CONNECTION_STRING,
    database: "starknetid",
    collectionName: "auto_renew_approvals",
    entityMode: true,
  },
};

export default function transform({ header, events }: Block) {
  if (!header) {
    console.log("missing header, unable to process", events.length, "events");
    return;
  }
  if (Number(header.blockNumber) < ETH_UPGRADE_A_BLOCK) {
    return tranformCairoZeroAR(events);
  }

  return tranformAR(events);
}

function tranformAR(events: EventWithTransaction[]) {
  const output = events
    .map(({ event }: EventWithTransaction) => {
      const key = BigInt(event.keys[0]);

      switch (key) {
        case SELECTOR_KEYS.ON_APPROVE: {
          const renewer = event.keys[1];
          const spender = event.keys[2];
          const allowance = uint256.uint256ToBN({
            low: event.data[0],
            high: event.data[1],
          });

          if (BigInt(spender) != AUTO_RENEW_CONTRACT) {
            return;
          }
          return {
            entity: { renewer },
            update: [
              {
                $set: {
                  renewer,
                  allowance: "0x" + allowance.toString(16),
                },
              },
            ],
          };
        }

        // should not happen
        default:
          return;
      }
    })
    .filter(Boolean);

  return output;
}

function tranformCairoZeroAR(events: EventWithTransaction[]) {
  const output = events
    .map(({ event }: EventWithTransaction) => {
      const key = BigInt(event.keys[0]);

      switch (key) {
        case SELECTOR_KEYS.ON_APPROVE: {
          const renewer = event.data[0];
          const spender = event.data[1];
          const allowance = uint256.uint256ToBN({
            low: event.data[2],
            high: event.data[3],
          });

          if (BigInt(spender) != AUTO_RENEW_CONTRACT) {
            return;
          }
          return {
            entity: { renewer },
            update: [
              {
                $set: {
                  renewer,
                  allowance: "0x" + allowance.toString(16),
                },
              },
            ],
          };
        }

        // should not happen
        default:
          return;
      }
    })
    .filter(Boolean);

  return output;
}
