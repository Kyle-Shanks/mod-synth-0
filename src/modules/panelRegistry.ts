import React from 'react'
import { DefaultModuleBodyPanel } from '../components/module-panels/DefaultModuleBodyPanel'
import { MixerPanel } from './mixer/panel'
import { PushButtonPanel } from './pushbutton/panel'
import { ScopePanel } from './scope/panel'
import { OutputPanel } from './output/panel'
import { ClockPanel } from './clock/panel'
import { SequencerPanel } from './sequencer/panel'
import { TunerPanel } from './tuner/panel'
import { XYScopePanel } from './xyscope/panel'
import { SpectrumPanel } from './spectrum/panel'
import { FeedbackDelayPanel } from './feedbackdelay/panel'
import { FMOpPanel } from './fmop/panel'
import { PluckPanel } from './pluck/panel'
import { CompressorPanel } from './compressor/panel'
import { ChordGenPanel } from './chordgen/panel'
import { KeyboardPanel } from './keyboard/panel'
import { VCAPanel } from './vca/panel'
import { NotePanel } from './note/panel'
import { ChaosPanel } from './chaos/panel'
import { VCFPanel } from './vcf/panel'
import { SubpatchInputPanel } from './subpatch-input/panel'
import { SubpatchOutputPanel } from './subpatch-output/panel'

export type ModuleBodyPanelComponent = React.ComponentType<{ moduleId: string }>

const PANEL_REGISTRY: Record<string, ModuleBodyPanelComponent> = {
  mixer: MixerPanel,
  pushbutton: PushButtonPanel,
  scope: ScopePanel,
  output: OutputPanel,
  clock: ClockPanel,
  sequencer: SequencerPanel,
  tuner: TunerPanel,
  xyscope: XYScopePanel,
  spectrum: SpectrumPanel,
  feedbackdelay: FeedbackDelayPanel,
  fmop: FMOpPanel,
  pluck: PluckPanel,
  compressor: CompressorPanel,
  chordgen: ChordGenPanel,
  keyboard: KeyboardPanel,
  vca: VCAPanel,
  note: NotePanel,
  chaos: ChaosPanel,
  vcf: VCFPanel,
  'subpatch-input': SubpatchInputPanel,
  'subpatch-output': SubpatchOutputPanel,
}

export function renderModuleBodyPanel(
  definitionId: string,
  moduleId: string,
): React.ReactElement {
  const PanelComponent = PANEL_REGISTRY[definitionId] ?? DefaultModuleBodyPanel
  return React.createElement(PanelComponent, { moduleId })
}
