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
import { EnvFollowDefinition } from './envfollow/definition'
import { ARDefinition } from './ar/definition'
import { ComparatorDefinition } from './comparator/definition'
import { LogicDefinition } from './logic/definition'
import { WavefolderDefinition } from './wavefolder/definition'
import { RingModDefinition } from './ringmod/definition'
import { BitcrusherDefinition } from './bitcrusher/definition'
import { DistortionDefinition } from './distortion/definition'
import { FlangerDefinition } from './flanger/definition'
import { ClockDivDefinition } from './clockdiv/definition'
import { EuclideanDefinition } from './euclidean/definition'

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

// register all core modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reg = (def: any) => registerModule(def as ModuleDefinition)

// stage 1-5 modules
reg(VCODefinition)
reg(VCFDefinition)
reg(VCADefinition)
reg(MixerDefinition)
reg(ADSRDefinition)
reg(PushButtonDefinition)
reg(ScopeDefinition)
reg(OutputDefinition)

// stage 6 modules
reg(LFODefinition)
reg(NoiseDefinition)
reg(SampleHoldDefinition)
reg(ClockDefinition)
reg(SequencerDefinition)
reg(AttenuverterDefinition)
reg(QuantizerDefinition)
reg(ReverbDefinition)
reg(DelayDefinition)

// stage 9 modules
reg(SlewDefinition)
reg(MultDefinition)
reg(EnvFollowDefinition)
reg(ARDefinition)
reg(ComparatorDefinition)
reg(LogicDefinition)
reg(WavefolderDefinition)
reg(RingModDefinition)

// stage 10 modules
reg(BitcrusherDefinition)
reg(DistortionDefinition)
reg(FlangerDefinition)
reg(ClockDivDefinition)
reg(EuclideanDefinition)
