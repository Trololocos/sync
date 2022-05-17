import { timeStamp } from "console";
import { randomUUID } from "crypto";
import dgram from "dgram";
import { clearTimeout } from "timers";
import { IRemoteProvider } from "./client_definitions";
import { EventMessage,  } from "./packet_definitions";
import {
	MEDIA_SYNC_LOOP,
	MEDIA_UPDATE_LOOP_TIMEOUT,
	PING_LOOP_TIMEOUT,
	TOTAL_PINGS,
} from "./shared_consts";
import {
	CallbackCollection,
	dMe,
	IDiscover,
	IP,
	milliseconds,
	queue,
	seconds,
	Timestamp,
} from "./shared_definitions";
import { MediaController } from "./MediaController";
import { SyncedEmitter } from "./SyncedEmitter";
import { avg, enqueue } from "./utils";

const node_discover = require("node-discover");

class Client{
}
class CatchUpClient{

}
class Master{
	
}
class CatchupServer{

}
class Emitter{

}
class mediaController{ //TODO rename

}

export class SyncObject implements IRemoteProvider {
	public discover: IDiscover;
	public addEventIn(event: string, timeout: milliseconds, ...args: string[]) {
		if (!this.discover.me.isMaster) {
			console.error(
				"error: El cliente no es maestro, el evento no se emitirá."
			);
			return;
		}
		const message: EventMessage = {
			event: event,
			timeout: timeout,
			args,
		};
		this.send("event", message); // TODO websocket
		const uuid = randomUUID();
		const events = this.eventsIn;
		events[uuid] = message;
		setTimeout(()=> delete events[uuid], timeout);
	}
	public scheduleMedia(
		media: HTMLMediaElement,
		schedule: milliseconds,
		seek: seconds = 0
	) {
		this.addEventIn("Schedule_media", schedule, media.src, seek.toString());
	}
	public addMediaController(
		media: HTMLMediaElement,
		schedule?: number,
		seek?: number
	): void {
		// TODO: remove controller
		this._media.push(new MediaController(media));
		if (schedule !== undefined) this.scheduleMedia(media, schedule, seek);
	}
	public onPromotion: (...args: any) => any = () => {};
	public onDemotion: (...args: any) => any = () => {};
	public onNewMaster: (...args: any) => any = () => {};
	// PRIVATE METHODS
	private send(channel: string, message: any): void {
		// discover.send wrapper
		this.discover.send(channel, message);
	}
	_socket: dgram.Socket | null = null;
	private _onPromotion() {
		this._socket = dgram.createSocket("udp4");

		this._socket.bind();
		this._socket.on("listening", ()=> {
			this.discover.me.initPort = this._socket!.address().port;
			this.discover.canHello = true;
			this.discover.hello();
		})

		this._socket.on("message", (msg, rinfo) => {
			const getMedia = ()=> {
				return this._media // Current playing media
				.filter((element) => element.scheduled)
				.map((element) => [
					element.medium.src,
					element.medium.currentTime,
				])
			}
			const message = msg.toString();
			let response;
			switch (message) {
				case "getevents":
					response = JSON.stringify({
						events: this.eventsIn,
						media: getMedia()
				  })
					break;
				  case "getTimes":
					response = JSON.stringify({
						events: this.eventsIn,
						media: getMedia()
				  })
				default:
					response = new Uint8Array()
					break;
			}
			this._socket!.send(response, rinfo.port, rinfo.address);
		});
	}
	private _initDiscover(): void {
		this.discover.on("promotion", () => {
			this._onPromotion();
			this.onPromotion();
		});
		this.discover.on("demotion", () => {
			if (this.interval) clearInterval(this.interval);
			this._socket!.close();
			this._socket = null;
			this.onDemotion();
		});

		this.discover.on("master", (a: any, b: any, c: any) => {
			this._onMaster(a, b, c); // todo
			this.onNewMaster();
		});


		this._eventList.Schedule_media = (args) => {
			const src    = args[0];
			const seek   = parseFloat(args[1]);
			const target = parseFloat(args[2]);
			
			const medium = this._media.find(
				(mediaController) => mediaController.medium.src === src
			);
			if (!medium) throw new Error("ERROR: Medio no encontrado");
			console.log("Scheduled via event at " + (+new Date() % 1000000));

			medium.onScheduled(seek, target);
		};

		this.discover.join("event", (event: EventMessage) => {
			this._emitter.eventIn(
				event.event,
				event.timeout,
				event.args
			);
		});
	}
	private _media: MediaController[] = [];
	private _emitter: SyncedEmitter;
	private _eventList: CallbackCollection;
	private pings: queue<milliseconds> = []; // This is a queue with the last MAX_OFFSET_ARRAY_LENGHT offsets
	private _ping = { ping: 0 };
	private _lastOffset: milliseconds;
	private eventsIn: Record<string, EventMessage> = {};
	private interval: NodeJS.Timer | null = null;

	constructor(
		events: CallbackCollection | null = null,
		paramDiscover: IDiscover | null = null
	) {
		this._eventList = events || {};
		this.discover = paramDiscover || new node_discover({}, () => {});

		this._initDiscover();
		this._emitter = new SyncedEmitter(this._eventList, this._ping);
		setInterval(() => this.syncMedia(), MEDIA_SYNC_LOOP);
	}
	private syncMedia() {
		const skew: milliseconds = this._ping.ping - this._lastOffset; //TODO
		this._lastOffset = this._ping.ping;
		this._media.forEach((x) => x.sync(skew));
	}
	private _reconnectionSocket: dgram.Socket | null = null;
	private _t0: Timestamp;
	private _masterPort: number;
	private _masterAddress: IP;





	
	private _onMaster(master: dMe, b: any, rinfo: dgram.RemoteInfo) {
		const send = (msg:any ) => this._reconnectionSocket!.send(msg, master.initPort, this._masterAddress);
		const ping = () => send(new Uint8Array());
		const requestData = ()=> send("getevents");
		const askVideoTimes = ()=>send("getTimes");

		let media: [];		
		let events: Record<string, EventMessage>;
		let locked: boolean = false;
		console.log("master found: " + master.id);
		this._masterPort = master.initPort!;
		this._masterAddress = rinfo.address; 
		if(!this._reconnectionSocket){
			this._reconnectionSocket =  dgram.createSocket("udp4");
			this._reconnectionSocket.bind();
		}


		this._reconnectionSocket.on("listening", () => {
			// I specify window because typescript gets confused
			let pingsTimeout = window.setTimeout(() => {
				console.error("data not received");
			}, 5000);
			this._t0 = performance.now();
			for (let index = 0; index < TOTAL_PINGS; index++)
				ping()
			requestData();	
			this._t0 = (this._t0 + performance.now())/2;
			
			this._reconnectionSocket!.on("message", (msg) => {
				enqueue(this.pings, (performance.now() - this._t0)/2, TOTAL_PINGS)
				if (msg.length > 0) { // Resync
					const message = JSON.parse(msg.toString());
					events = message.events;
					if (!locked){
						window.clearTimeout(pingsTimeout);
						process();
						locked = true;
					}
					processMedia(message.media)
				}
			});
		});
		const process = () => {
			this._ping.ping = avg(this.pings)
			for (const event in events) {
				if (Object.prototype.hasOwnProperty.call(events, event)) {
					const element = events[event];
					console.log("adjust: " + -(this._ping.ping + this._emitter.delay))
					this._emitter.eventIn(
						element.event,
						element.timeout,
						element.args
					);
				}
			}
			for (const tuple of media) {
				const medium = this._media.find(
					(element) => element.medium.src === tuple[0]
				);
				if (medium) {
					console.log("Scheduled via catch-up at " + (+new Date() % 1000000));
					medium.onScheduled(
						tuple[1] + this._ping.ping / 1000,
						performance.now()
					);
				} else console.log(`Warning: medium ${tuple[0]} not found!`);
			}
			
		};
		const processMedia = (media: string[][])=>{ //TODO duplicate code!
			for (const tuple of media) {
				const medium = this._media.find(
					(element) => element.medium.src === tuple[0]
				);
				if (medium) {
					medium.seek0 = parseFloat(tuple[1]) + this._ping.ping / 1000;

				} else console.log(`Warning: medium ${tuple[0]} not found!`);
			}
		}
		setInterval(()=>{ping(); this._t0 = performance.now()}, PING_LOOP_TIMEOUT)
		setInterval(()=>{askVideoTimes();this._t0 = performance.now()}, MEDIA_UPDATE_LOOP_TIMEOUT);

		}
	}
	