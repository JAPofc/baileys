// §2.223 fixture: write a key and then just... finish. No process.exit().
// The debounce timer must not hold the event loop open: before it was unref'd, this
// script sat idle for the full 3 second flush timeout before Node would let it exit.
import { useSingleFileAuthState } from '../../lib/Utils/use-single-file-auth-state.js'

const { state } = await useSingleFileAuthState(process.argv[2])
state.keys.set({ 'pre-key': { 1: { public: Buffer.from('aa', 'hex') } } })
console.log('done')
