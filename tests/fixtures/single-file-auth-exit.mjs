// §2.223 fixture: pair, save, exit immediately. Before the fix, `await saveCreds()`
// resolved while the write was still sitting in a 3-second debounce, so this process
// exited with nothing on disk and the next run had to scan a new QR code.
import { useSingleFileAuthState } from '../../lib/Utils/use-single-file-auth-state.js'

const { state, saveCreds } = await useSingleFileAuthState(process.argv[2])
state.creds.me = { id: 'exit-test@s.whatsapp.net', name: 'exit' }
await saveCreds()
process.exit(0)
