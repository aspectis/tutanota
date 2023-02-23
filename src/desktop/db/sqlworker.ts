import { parentPort, workerData } from "node:worker_threads"
import { DesktopSqlCipher } from "./DesktopSqlCipher.js"
import { MessageDispatcher, Request, WebWorkerTransport } from "../../api/common/MessageDispatcher.js"
import { SqlCipherFacade } from "../../native/common/generatedipc/SqlCipherFacade.js"
import { downcast } from "@tutao/tutanota-utils"

console.log("hello from worker", workerData)

export type SqlCipherCommand = keyof SqlCipherFacade | "exit"

if (parentPort != null) {
	const sqlCipherFacade = new DesktopSqlCipher(workerData.nativeBindingPath, workerData.dbPath, workerData.integrityCheck)
	const worker = {
		set onmessage(value: Worker["onmessage"]) {
			parentPort!.on("message", downcast(value))
		},
		postMessage: parentPort.postMessage,
	}
	const workerTransport = new MessageDispatcher(new WebWorkerTransport<never, SqlCipherCommand>(downcast(worker)), {
		all(msg: Request<"openDb" | "closeDb" | "deleteDb" | "run" | "get" | "all" | "lockRangesDbAccess" | "unlockRangesDbAccess">): Promise<any> {
			return sqlCipherFacade.all(msg.args[0], msg.args[1])
		},
		closeDb(msg: Request<"openDb" | "closeDb" | "deleteDb" | "run" | "get" | "all" | "lockRangesDbAccess" | "unlockRangesDbAccess">): Promise<any> {
			return sqlCipherFacade.closeDb()
		},
		deleteDb(msg: Request<"openDb" | "closeDb" | "deleteDb" | "run" | "get" | "all" | "lockRangesDbAccess" | "unlockRangesDbAccess">): Promise<any> {
			return sqlCipherFacade.deleteDb(msg.args[0])
		},
		get(msg: Request<"openDb" | "closeDb" | "deleteDb" | "run" | "get" | "all" | "lockRangesDbAccess" | "unlockRangesDbAccess">): Promise<any> {
			return sqlCipherFacade.get(msg.args[0], msg.args[1])
		},
		lockRangesDbAccess(
			msg: Request<"openDb" | "closeDb" | "deleteDb" | "run" | "get" | "all" | "lockRangesDbAccess" | "unlockRangesDbAccess">,
		): Promise<any> {
			return sqlCipherFacade.lockRangesDbAccess(msg.args[0])
		},
		openDb(msg: Request<"openDb" | "closeDb" | "deleteDb" | "run" | "get" | "all" | "lockRangesDbAccess" | "unlockRangesDbAccess">): Promise<any> {
			return sqlCipherFacade.openDb(msg.args[0], msg.args[1])
		},
		run(msg: Request<"openDb" | "closeDb" | "deleteDb" | "run" | "get" | "all" | "lockRangesDbAccess" | "unlockRangesDbAccess">): Promise<any> {
			return sqlCipherFacade.run(msg.args[0], msg.args[1])
		},
		unlockRangesDbAccess(
			msg: Request<"openDb" | "closeDb" | "deleteDb" | "run" | "get" | "all" | "lockRangesDbAccess" | "unlockRangesDbAccess">,
		): Promise<any> {
			return sqlCipherFacade.unlockRangesDbAccess(msg.args[0])
		},
		exit(msg: Request<"openDb" | "closeDb" | "deleteDb" | "run" | "get" | "all" | "lockRangesDbAccess" | "unlockRangesDbAccess">): Promise<any> {
			process.exit()
		},
	})
	console.log("set up sql cipher")
} else {
	process.exit(0)
}
