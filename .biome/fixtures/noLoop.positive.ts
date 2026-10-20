// Positive sample for lint/plugin/noLoop (for-in is suspicious/noForIn).
declare const xs: ReadonlyArray<number>;
declare const record: Record<string, number>;
declare const stream: AsyncIterable<number>;
declare function keepGoing(): boolean;
declare function use(value: unknown): void;

export function loops(): void {
	for (;;) {
		break;
	}
	for (const x of xs) {
		use(x);
	}
	for (const k in record) {
		use(k);
	}
	while (keepGoing()) {
		use(0);
	}
	do {
		use(1);
	} while (keepGoing());
}

export async function drain(): Promise<void> {
	for await (const chunk of stream) {
		use(chunk);
	}
}
