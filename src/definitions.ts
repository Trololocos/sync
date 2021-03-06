import { MediaController } from "./MediaController";

export type Signal = "stop" | "start" | "etc";
export type Timestamp = number;
export type milliseconds = number;
export type seconds = number;
export type minutes = number;

export type frames = number;
export type IP = string;
export type uuid = string;
export type CallbackCollection = Record<string, (...args: string[]) => void>;
export type NodeCollection = Record<uuid, dMe>;
export type mediaCollection = Record<string, MediaController>
export type queue<T> = Array<T>;


type DiscoverEvent =
	| "promotion"
	| "demotion"
	| "added"
	| "removed"
	| "master"
	| "helloReceived"
	| "helloEmitted";

export interface dMe {
	isMaster: boolean;
	weight: number;
	id?: uuid;
	initPort?: number;
}

export interface Discover {
	on(event: DiscoverEvent, callback: (arg: dMe, ...args: any) => void): void;
	join(channel: string, callback: (message: any) => void): void;
	leave(channel: string): void;
	send(channel: string, message: any): void;

	promote(): void;
	demote(): void;
	hello(): void;

	me: dMe;
	nodes: NodeCollection;
	eachNode(fn: () => any): void;
	channels: string[];
	canHello: boolean;
}
