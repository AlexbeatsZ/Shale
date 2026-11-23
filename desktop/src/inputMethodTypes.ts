export interface InputSource { id: string; label: string; english: boolean }
export interface InputMethodState { source: string; open?: boolean; conversion?: number }
export interface InputMethodRequest {
  owner: string;
  mode: 'normal' | 'insert' | 'release';
  englishSource?: string;
}
export interface InputMethodBridge {
  supported: boolean;
  list(): Promise<InputSource[]>;
  update(request: InputMethodRequest): Promise<void>;
}
