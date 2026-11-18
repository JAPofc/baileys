// §2.99 repro -- every AIRich card ships bot "verification" metadata that no verifier can read.
//
// botMetadataCertificate() builds a buffer that *starts* like DER (0x30 0x82 = SEQUENCE,
// 2-byte length) and then fills the REST WITH RANDOM BYTES — including the two length bytes.
// The declared length therefore has nothing to do with the real one, so the chain is not a
// parsable certificate at all; botMetadataSignature() is 64 random bytes in the same spirit.
//
// We attach that to every card as `verificationMetadata.proofs`, unconditionally and
// silently — and our own verifier (§2.85) rejects it.
import { AIRich, botMetadataCertificate, isParsableCertificateChain, verifyBotSignature } from '../lib/index.js'

const sock = { user: { id: '1@s.whatsapp.net' }, logger: { warn() {}, debug() {} }, relayMessage: async () => {}, sendMessage: async () => ({ key: { id: 'X' } }) }

const cert = botMetadataCertificate()
const declared = (cert[2] << 8) | cert[3]
console.log('  one certificate:')
console.log(`    bytes            : ${cert.length}`)
console.log(`    DER header says  : SEQUENCE, length ${declared}`)
console.log(`    actually carries : ${cert.length - 4}  ${declared === cert.length - 4 ? '' : '← *** mismatch: not parsable DER ***'}`)

const rich = new AIRich(sock)
rich.addHeading('Halo').addText('isi kartu')
const msg = await rich.build({})
const proof = msg.messageContextInfo.botMetadata.verificationMetadata.proofs[0]

console.log('\n  what the card claims:')
console.log(`    proofs attached      : ${msg.messageContextInfo.botMetadata.verificationMetadata.proofs.length}`)
console.log(`    signature bytes      : ${proof.signature.length} (random)`)
console.log(`    chain parsable?      : ${isParsableCertificateChain(proof.certificateChain)}`)
console.log(`    our own verifier says: ${JSON.stringify(verifyBotSignature({ message: msg }).reason)}`)
console.log('\n  → we advertise "verified bot" metadata that is structurally invalid, with nothing')
console.log('    telling the developer it is a placeholder.')
