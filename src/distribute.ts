export const BROADCAST_CHANNEL_PREFIX = "@okikio/sharedworker";
export const SEPERATOR = ":";

export const BROADCAST_CHANNEL_NAME = `${BROADCAST_CHANNEL_PREFIX}${SEPERATOR}all`;

export function newUUID(size = 10): [string, number] {
  return [
    crypto.getRandomValues(new Uint32Array(size)).join(SEPERATOR), 
    Date.now()
  ];
}

type UUID = ReturnType<typeof newUUID>;
export function toUUIDStr(uuid: UUID) {
  return uuid.join(SEPERATOR);
}

export function getChannelName(broadcastName: string, uuid: UUID) {
  return `${broadcastName}${SEPERATOR}${toUUIDStr(uuid)}`
}

function request<T>(type: string, data: T = null) {
  return { type, data };
}

const clearArpRequest = () => request("clear-arp");

const arpRequest = (uuid: UUID, uuids: string[]) => {
  return request("arp", { uuid, uuidstr: toUUIDStr(uuid), uuids });
}

const removeArpRequest = (uuid: UUID) => {
  return request("remove-arp", { uuid });
}

function toNumber(num: unknown) {
  if (!Number.isNaN(num) && num != Infinity) {
    return Math.max(parseInt(num as string), 0);
  }

  return 0;
}

function newPromise<T = unknown>() {
  let resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => (resolve = res, reject = rej));
  return { promise, resolve, reject };
}

export class DistributeSharedWorker {
  private broadcast: BroadcastChannel;
  private broadcastName: string;

  private uuid = newUUID();
  private uuidstr: string;

  private ARP_PROMISE: ReturnType<typeof newPromise<UUID[]>>;

  /** Broadcast name + UUID */
  private uuids: UUID[] = [];
  private uuidsstr: string[] = [];

  private eventemitter = new EventTarget();
  private EVENTS = {
    ARP: 'arp'
  };

  private get maxConnections() {
    return toNumber(globalThis?.localStorage?.[this.broadcastName]) ?? 0; 
  }

  private set maxConnections(value: number) {
    globalThis.localStorage[this.broadcastName] = value;
  }

  /** Stores currently open channel */
  private channel: BroadcastChannel;

  constructor(
    private url: string | URL,
    opts?: WorkerOptions
  ) {
    this.broadcastName = `${BROADCAST_CHANNEL_PREFIX}${SEPERATOR}${url.toString()}`;
    this.broadcast = new BroadcastChannel(this.broadcastName);

    this.addUUID(this.uuid);

    this.uuidstr = toUUIDStr(this.uuid);
    this.requestHandler = this.requestHandler.bind(this);

    this.broadcast.addEventListener("message", this.requestHandler); 
    globalThis.addEventListener('pagehide', (event) => { 
      console.log("pagehide")
      const prevMaxConnections = this.maxConnections;
      this.maxConnections = 0;

      if (prevMaxConnections > 0) this.arpRequest();
      // this.broadcast.postMessage(removeArpRequest(this.uuid));
    });

    console.log({ uuid: this.uuidstr });

    this.arpRequest();
  }

  private requestHandler({ data: msg }: MessageEvent<ReturnType<typeof request>>){
    const { type, data } = msg;

    switch (type) {
      case "arp": {
        const { uuid, uuidstr, uuids } = data as ReturnType<typeof arpRequest>['data'];

        const unique = !this.uuidsstr.includes(uuidstr);
        if (unique) this.addUUID(uuid);

        if (!uuids.includes(this.uuidstr)) {
          this.broadcast.postMessage(arpRequest(this.uuid, [...uuids, this.uuidstr]));
        }

        // console.log({ thisuuids: this.uuidsstr, uuids, max: this.maxConnections })

        if (this.uuids.length == this.maxConnections) {
          this.eventemitter.dispatchEvent(new Event(this.EVENTS.ARP));
          // this.ARP_PROMISE.resolve(this.uuids);
        }
        break;
      }

      case "remove-arp": {
        const { uuid } = data as ReturnType<typeof removeArpRequest>['data'];
        this.removeUUID(uuid);
        break;
      }

      case "clear-arp": {
        this.resetUUIDs();
        break;
      }
    }
  }

  private async arpRequest() {
    this.maxConnections++;

    this.ARP_PROMISE = newPromise<UUID[]>();

    this.broadcast.postMessage(clearArpRequest());
    this.broadcast.postMessage(arpRequest(this.uuid, []));

    // await this.ARP_PROMISE.promise;
    this.eventemitter.addEventListener(this.EVENTS.ARP, () => {
      console.log(this.uuids)
      // const mainChannelUUID = this.uuids.sort((a, b) => (a[1] - b[1]))[0];
      // console.log({
      //   maxConnections: this.maxConnections
      // })

      // if (toUUIDStr(mainChannelUUID) !== this.channel?.name) {
      //   this.channel?.close?.();
      //   this.channel = null;

      //   this.getChannel(mainChannelUUID);
      //   console.log(toUUIDStr(mainChannelUUID))
      // }
    });
  }

  private addUUID(uuid: UUID) {
    this.uuids.push(uuid);
    this.uuidsstr.push(toUUIDStr(uuid));
  }

  private removeUUID(uuid: UUID) {
    const index = this.uuidsstr.indexOf(toUUIDStr(uuid));
    this.uuids.splice(index, 1);
    this.uuidsstr.splice(index, 1);
  }

  private resetUUIDs() {
    this.uuids = [this.uuid];
    this.uuidsstr = [toUUIDStr(this.uuid)];
  }

  private getChannel(uuid: UUID) { 
    if (this.channel) return this.channel;

    const name = getChannelName(this.broadcastName, uuid);
    this.channel = new BroadcastChannel(name);
    return this.channel; 
  }
}

export default DistributeSharedWorker;