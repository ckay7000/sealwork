#[cfg(target_os = "wasi")]
use base64::{engine::general_purpose::STANDARD, Engine};
#[cfg(target_os = "wasi")]
use sealwork_worker::*;
#[cfg(target_os = "wasi")]
use serde_json::{json, Value};

#[cfg(feature = "ledgerline-v1")]
const BUILD: &str = include_str!("../manifests/build/ledgerline-v1.json");
#[cfg(feature = "ledgerline-v2")]
const BUILD: &str = include_str!("../manifests/build/ledgerline-v2.json");
#[cfg(feature = "archivist-v1")]
const BUILD: &str = include_str!("../manifests/build/archivist-v1.json");
#[cfg(feature = "verifier")]
const BUILD: &str = include_str!("../manifests/build/verifier.json");
#[cfg(not(any(feature = "ledgerline-v1", feature = "ledgerline-v2", feature = "archivist-v1", feature = "verifier")))]
const BUILD: &str = "{}";

#[cfg(all(target_os = "wasi", feature = "ledgerline-v1"))]
#[used]
#[link_section = "outlayer.manifest"]
static MANIFEST: [u8; include_bytes!("../manifests/runtime/ledgerline-v1.json").len()] = *include_bytes!("../manifests/runtime/ledgerline-v1.json");
#[cfg(all(target_os = "wasi", feature = "ledgerline-v2"))]
#[used]
#[link_section = "outlayer.manifest"]
static MANIFEST: [u8; include_bytes!("../manifests/runtime/ledgerline-v2.json").len()] = *include_bytes!("../manifests/runtime/ledgerline-v2.json");
#[cfg(all(target_os = "wasi", feature = "archivist-v1"))]
#[used]
#[link_section = "outlayer.manifest"]
static MANIFEST: [u8; include_bytes!("../manifests/runtime/archivist-v1.json").len()] = *include_bytes!("../manifests/runtime/archivist-v1.json");
#[cfg(all(target_os = "wasi", feature = "verifier"))]
#[used]
#[link_section = "outlayer.manifest"]
static MANIFEST: [u8; include_bytes!("../manifests/runtime/verifier.json").len()] = *include_bytes!("../manifests/runtime/verifier.json");

#[cfg(target_os = "wasi")]
fn run() -> Result<Value, &'static str> {
    let request: Value = outlayer::env::input_json().map_err(|_| "request_invalid")?.ok_or("request_invalid")?;
    let job_id = request["job_id"].as_str().ok_or("request_invalid")?;
    let commitment = request["input_commitment"].as_str().ok_or("request_invalid")?;
    let manifest_hash = digest(BUILD.as_bytes());
    let private_json = std::env::var("SEALWORK_INPUT").map_err(|_| "private_input_missing")?;
    let packet: PrivatePacket = serde_json::from_str(&private_json).map_err(|_| "private_input_invalid")?;
    validate_packet(&packet, job_id, commitment)?;
    let aad = format!("sealwork:artifact:v1:{}:{}", job_id, commitment);
    let request_id = outlayer::env::request_id();
    let transaction_hash = outlayer::env::transaction_hash();
    validate_execution_reference(request_id.as_deref(), transaction_hash.as_deref())?;

    if cfg!(feature = "verifier") {
        let encoded = request["sealed_result"].as_str().ok_or("request_invalid")?;
        let ciphertext = STANDARD.decode(encoded).map_err(|_| "artifact_invalid")?;
        let plaintext = outlayer::encryption_keys::decrypt("results", None, &ciphertext, aad.as_bytes()).map_err(|_| "artifact_decryption_failed")?;
        let artifact: Artifact = serde_json::from_slice(&plaintext).map_err(|_| "artifact_invalid")?;
        if Some(artifact.manifest_hash.as_str()) != request["agent_manifest_hash"].as_str() || Some(artifact.result_commitment.as_str()) != request["result_commitment"].as_str() { return Err("artifact_binding_failed"); }
        let checks = verify(&packet.input, commitment, &artifact)?;
        let accepted = checks.iter().all(|check| check.passed);
        Ok(json!({
            "schema":"sealwork.verification.v1", "job_id":job_id, "input_commitment":commitment,
            "agent_manifest_hash":artifact.manifest_hash, "verifier_manifest_hash":manifest_hash,
            "result_commitment":artifact.result_commitment, "result_ciphertext":artifact.result_ciphertext,
            "accepted":accepted, "checks":checks, "request_id":request_id, "transaction_hash":transaction_hash
        }))
    } else {
        if request["agent_manifest_hash"].as_str() != Some(manifest_hash.as_str()) { return Err("manifest_binding_failed"); }
        let result = produce(&packet.input, cfg!(feature = "ledgerline-v2"))?;
        let result_json = serde_json::to_string(&result).map_err(|_| "result_invalid")?;
        let result_commitment = result_commitment(&result_json, &packet.input.salt);
        let artifact = Artifact {
            job_id:job_id.to_owned(), input_commitment:commitment.to_owned(), manifest_hash:manifest_hash.clone(),
            result_ciphertext:encrypt_delivery(&packet.input, commitment, &result_json)?, result:result_json,
            result_commitment:result_commitment.clone(),
        };
        let private_artifact = serde_json::to_vec(&artifact).map_err(|_| "artifact_invalid")?;
        let sealed = outlayer::encryption_keys::encrypt("results", None, &private_artifact, aad.as_bytes()).map_err(|_| "artifact_encryption_failed")?;
        Ok(json!({
            "schema":"sealwork.agent-output.v1", "job_id":job_id, "input_commitment":commitment,
            "manifest_hash":manifest_hash, "result_commitment":result_commitment,
            "sealed_result":STANDARD.encode(sealed), "request_id":request_id, "transaction_hash":transaction_hash
        }))
    }
}

fn main() {
    #[cfg(target_os = "wasi")]
    {
        // Fail closed with a public error code. Library errors, records,
        // delivery keys, and plaintext are never printed to either stream.
        let response = run().unwrap_or_else(|code| serde_json::json!({"schema":"sealwork.error.v1","code":code}));
        outlayer::env::output_json(&response).ok();
    }
    #[cfg(not(target_os = "wasi"))]
    { let _ = BUILD; eprintln!("The Sealwork runtime executes as an attested WASI Preview 2 component. Use cargo test for local checks."); }
}
