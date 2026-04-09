import type { ModuleDefinition } from '../engine/types'
import { VCODefinition } from './vco/definition'
import { VCFDefinition } from './vcf/definition'
import { VCADefinition } from './vca/definition'
import { MixerDefinition } from './mixer/definition'
import { ADSRDefinition } from './adsr/definition'
import { PushButtonDefinition } from './pushbutton/definition'
import { ScopeDefinition } from './scope/definition'
import { OutputDefinition } from './output/definition'
import { LFODefinition } from './lfo/definition'
import { NoiseDefinition } from './noise/definition'
import { SampleHoldDefinition } from './samplehold/definition'
import { ClockDefinition } from './clock/definition'
import { SequencerDefinition } from './sequencer/definition'
import { AttenuverterDefinition } from './attenuverter/definition'
import { QuantizerDefinition } from './quantizer/definition'
import { ReverbDefinition } from './reverb/definition'
import { DelayDefinition } from './delay/definition'
import { SlewDefinition } from './slew/definition'
import { MultDefinition } from './mult/definition'
import { EnvFollowerDefinition } from './envfollower/definition'
import { ARDefinition } from './ar/definition'
import { ADDefinition } from './ad/definition'
import { ComparatorDefinition } from './comparator/definition'
import { LogicDefinition } from './logic/definition'
import { WavefolderDefinition } from './wavefolder/definition'
import { RingModDefinition } from './ringmod/definition'
import { BitcrusherDefinition } from './bitcrusher/definition'
import { DistortionDefinition } from './distortion/definition'
import { FlangerDefinition } from './flanger/definition'
import { ClockDivDefinition } from './clockdiv/definition'
import { EuclideanDefinition } from './euclidean/definition'
import { ResonatorDefinition } from './resonator/definition'
import { TunerDefinition } from './tuner/definition'
import { XYScopeDefinition } from './xyscope/definition'
import { SpectrumDefinition } from './spectrum/definition'
import { FeedbackDelayDefinition } from './feedbackdelay/definition'
import { FMOpDefinition } from './fmop/definition'
import { PluckDefinition } from './pluck/definition'
import { CompressorDefinition } from './compressor/definition'
import { ProbGateDefinition } from './probgate/definition'
import { ChordGenDefinition } from './chordgen/definition'
import { ChordDiceDefinition } from './chorddice/definition'
import { PannerDefinition } from './panner/definition'
import { TapeDelayDefinition } from './tapedelay/definition'
import { KeyboardDefinition } from './keyboard/definition'
import { CVDefinition } from './cv/definition'
import { OctaveDefinition } from './octave/definition'
import { NoteDefinition } from './note/definition'
import { ChaosDefinition } from './chaos/definition'
import { MuteDefinition } from './mute/definition'
import { SubpatchInputDefinition } from './subpatch-input/definition'
import { SubpatchOutputDefinition } from './subpatch-output/definition'

const registry = new Map<string, ModuleDefinition>()

export function registerModule(def: ModuleDefinition): void {
  if (registry.has(def.id)) {
    console.warn(`module '${def.id}' is already registered — overwriting`)
  }
  registry.set(def.id, def)
}

export function getModule(id: string): ModuleDefinition | undefined {
  return registry.get(id)
}

export function getAllModules(): ModuleDefinition[] {
  return [...registry.values()]
}

// register all modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reg = (def: any) => registerModule(def as ModuleDefinition)

// foundational modules
reg(VCODefinition)
reg(VCFDefinition)
reg(VCADefinition)
reg(MixerDefinition)
reg(ADSRDefinition)
reg(PushButtonDefinition)
reg(ScopeDefinition)
reg(OutputDefinition)

// generators, timing, and modulation
reg(LFODefinition)
reg(NoiseDefinition)
reg(SampleHoldDefinition)
reg(ClockDefinition)
reg(SequencerDefinition)
reg(AttenuverterDefinition)
reg(QuantizerDefinition)
reg(ReverbDefinition)
reg(DelayDefinition)

// utilities and dynamics
reg(SlewDefinition)
reg(MultDefinition)
reg(EnvFollowerDefinition)
reg(ARDefinition)
reg(ADDefinition)
reg(ComparatorDefinition)
reg(LogicDefinition)
reg(WavefolderDefinition)
reg(RingModDefinition)

// fx and advanced control
reg(BitcrusherDefinition)
reg(DistortionDefinition)
reg(FlangerDefinition)
reg(ClockDivDefinition)
reg(EuclideanDefinition)

// physical modeling
reg(ResonatorDefinition)

// display modules
reg(TunerDefinition)
reg(XYScopeDefinition)
reg(SpectrumDefinition)

// expressive voice/fx modules
reg(FeedbackDelayDefinition)
reg(FMOpDefinition)
reg(PluckDefinition)
reg(CompressorDefinition)
reg(ProbGateDefinition)
reg(ChordGenDefinition)
reg(ChordDiceDefinition)
reg(PannerDefinition)
reg(TapeDelayDefinition)
reg(KeyboardDefinition)
reg(CVDefinition)
reg(OctaveDefinition)
reg(NoteDefinition)
reg(ChaosDefinition)
reg(MuteDefinition)

// subpatch proxy modules (internal: true — hidden at root level in command palette)
reg(SubpatchInputDefinition)
reg(SubpatchOutputDefinition)
