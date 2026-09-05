use std::{env, fs, path::PathBuf};

use serde::Deserialize;

#[derive(Deserialize)]
struct Manifest {
    probes: Vec<Probe>,
}

#[derive(Deserialize)]
struct Probe {
    id: String,
    title: String,
    comparison_mode: String,
    scenario: String,
}

fn main() {
    let root = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("Cargo manifest directory"));
    let manifest_path = root.join("probes/glamsterdam/manifest.yaml");
    println!("cargo:rerun-if-changed={}", manifest_path.display());
    let manifest: Manifest = serde_yaml::from_str(
        &fs::read_to_string(&manifest_path).expect("probe manifest must be readable"),
    )
    .expect("probe manifest must be valid YAML");
    let mut generated = String::from("&[\n");
    for probe in manifest.probes {
        let scenario_path = root.join("probes/glamsterdam").join(&probe.scenario);
        println!("cargo:rerun-if-changed={}", scenario_path.display());
        generated.push_str(&format!(
            "BuiltInProbe {{ id: {:?}, title: {:?}, comparison_mode: {:?}, scenario: include_str!({:?}) }},\n",
            probe.id,
            probe.title,
            probe.comparison_mode,
            scenario_path.display().to_string(),
        ));
    }
    generated.push_str("]\n");
    let output = PathBuf::from(env::var("OUT_DIR").expect("Cargo output directory"))
        .join("probe_registry.rs");
    fs::write(output, generated).expect("generated probe registry must be writable");
}
