import { useState, useCallback, useRef, useEffect } from 'react';
import { useSessionContext } from '../context/SessionContext';
import { useLiveAgent } from '../hooks/useLiveAgent';
import { startMicCapture } from '../lib/audioCapture';
import { Mic, MicOff, Send, Play, Radio, Bell, Layers, ExternalLink, Copy, Download, X } from 'lucide-react';
import JSZip from 'jszip';
import {
  createSessionPoc,
  exportSessionPoc,
  getGithubStatus,
  getOauthStartUrl,
  getSessionPoc,
  resendSessionPocNotification,
  setGithubDefaultRepo,
  type GithubStatusResponse,
  type PocDraft,
  type PocFileSnippet,
  type PocNotification,
  type PocPayload,
} from '../lib/api';
import { buildReferenceLinks } from '../lib/referenceSearch';
import type { GraphData, LogMessage, Node, Edge } from '../types/api';

interface LiveViewProps {
  onGraphUpdate?: (data: GraphData) => void;
  onLog?: (message: LogMessage) => void;
  onConceptMapUpdate?: (conceptMap: Record<string, string[]>, feasibilitySignal: number | null) => void;
  onTurnComplete?: () => void;
  onMinimize?: () => void;
  onClose?: () => void;
}

type PocView = {
  pocDraft: PocDraft;
  notification?: PocNotification;
  github?: {
    prUrl?: string;
    prNumber?: string | number;
    branch?: string;
    owner?: string;
    repo?: string;
  };
  githubWarning?: string;
};

const TECH_STACK_OPTIONS = [
  'Node.js',
  'Express',
  'React',
  'Next.js',
  'TypeScript',
  'Firebase',
  'Supabase',
  'PostgreSQL',
  'MongoDB',
  'Tailwind',
  'Docker',
];

const PRODUCT_TYPES = ['SaaS', 'Marketplace', 'Mobile App', 'Internal Tool', 'API Product'];
const AI_STUDIO_API_KEY_STORAGE_KEY = 'mm_ai_studio_api_key';
const parseStackFromText = (text: string): string[] => {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matches = TECH_STACK_OPTIONS.filter((opt) => {
    const key = opt.toLowerCase().replace('.js', '');
    return lower.includes(key);
  });
  return Array.from(new Set(matches));
};

function redactSensitive(message: string): string {
  if (!message) return message;
  return message
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/("aiStudioApiKey"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2');
}

/** Strip internal reasoning and raw JSON so only the user-facing reply is shown. */
function stripJsonBlob(text: string): string {
  let out = text;
  const jsonStart = out.indexOf('{"conceptMap":');
  if (jsonStart < 0) return out;

  let depth = 0;
  let j = jsonStart;
  while (j < out.length) {
    if (out[j] === '{') depth++;
    else if (out[j] === '}') {
      depth--;
      if (depth === 0) {
        out = (out.slice(0, jsonStart).trimEnd() + out.slice(j + 1).trimStart()).trim();
        break;
      }
    }
    j++;
  }
  return out;
}

function splitAssistantContent(raw: string): { response: string; thoughts: string } {
  const base = stripJsonBlob(raw || '').trim();
  if (!base) return { response: '', thoughts: '' };

  const withoutThoughtTags = base
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim();

  const finalMarker = withoutThoughtTags.match(/\b(final answer|answer|response)\s*:\s*/i);
  if (finalMarker && finalMarker.index !== undefined) {
    const idx = finalMarker.index;
    const splitIdx = idx + finalMarker[0].length;
    return {
      response: withoutThoughtTags.slice(splitIdx).trim(),
      thoughts: withoutThoughtTags.slice(0, idx).trim(),
    };
  }

  const thoughtish = /(^\*\*.*\*\*$)|\b(i'm now|i have now|i've now|i've homed in|zeroing in|moving toward|structuring this|assessment leans|refining|considering options|as a concept map|backend requirements)\b/i;
  const paras = withoutThoughtTags.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length <= 1) {
    if (paras[0] && thoughtish.test(paras[0])) {
      return { response: '', thoughts: paras[0] };
    }
    return { response: withoutThoughtTags, thoughts: '' };
  }

  let splitAt = 0;
  while (splitAt < paras.length && thoughtish.test(paras[splitAt])) {
    splitAt++;
  }

  if (splitAt > 0) {
    return {
      response: paras.slice(splitAt).join('\n\n').trim(),
      thoughts: paras.slice(0, splitAt).join('\n\n').trim(),
    };
  }

  return { response: withoutThoughtTags, thoughts: '' };
}

function hasPocIntent(text: string): boolean {
  if (!text.trim()) return false;
  return /(build|create|generate|make)\s+(a\s+)?(poc|proof of concept)|\b(poc|proof of concept)\b/i.test(text);
}

function sanitizeTextLabel(text: string): string {
  return text
    .replace(/^[`"'[\]().,:;!?-]+|[`"'[\]().,:;!?-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSentenceLike(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 8 || /[.!?]/.test(text) || text.length > 64;
}

function normalizeConceptMap(map: Record<string, string[]> | null): Record<string, string[]> {
  if (!map) return {};

  const out: Record<string, string[]> = {};
  const seenConcepts = new Set<string>();

  Object.entries(map).forEach(([rawConcept, rawTerms]) => {
    const concept = sanitizeTextLabel(rawConcept);
    if (!concept || isSentenceLike(concept)) return;
    const conceptKey = concept.toLowerCase();
    if (seenConcepts.has(conceptKey)) return;
    seenConcepts.add(conceptKey);

    const terms = Array.isArray(rawTerms)
      ? rawTerms
          .map((t) => sanitizeTextLabel(String(t)))
          .filter((t) => t && !isSentenceLike(t))
          .filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
          .slice(0, 8)
      : [];

    out[concept] = terms;
  });

  return out;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4);
}

function filterConceptMapToCurrentFlow(
  map: Record<string, string[]> | null,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  activeReply: string
): Record<string, string[]> {
  const normalized = normalizeConceptMap(map);
  if (Object.keys(normalized).length === 0) return {};

  const recentMessages = messages.slice(-4).map((m) => m.content).join(' ');
  const contextTokens = new Set([
    ...tokenize(recentMessages),
    ...tokenize(activeReply),
  ]);

  if (contextTokens.size === 0) return normalized;

  const filteredEntries = Object.entries(normalized).filter(([concept, terms]) => {
    const conceptTokens = tokenize(concept);
    const termTokens = Array.isArray(terms) ? tokenize(terms.join(' ')) : [];
    return [...conceptTokens, ...termTokens].some((t) => contextTokens.has(t));
  });

  // Keep a useful map even if token matching is too strict.
  if (filteredEntries.length === 0) {
    return Object.fromEntries(Object.entries(normalized).slice(-3));
  }

  return Object.fromEntries(filteredEntries);
}

function normalizePocResponse(raw: unknown): PocView | null {
  const payload = (raw as any)?.data ?? raw;
  const draftRaw =
    payload?.pocDraft ??
    payload?.draft ??
    payload?.poc?.pocDraft ??
    payload?.poc?.draft;

  if (!draftRaw) return null;

  const toArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map((item) => String(item));
    if (typeof v === 'string' && v.trim()) return [v];
    return [];
  };

  const filesRaw = Array.isArray(draftRaw.files) ? draftRaw.files : [];
  const files: PocFileSnippet[] = filesRaw.map((f: any) => {
    if (typeof f === 'string') return { content: f };
    return {
      path: f?.path ?? f?.filename,
      filename: f?.filename,
      language: f?.language,
      content: f?.content ?? f?.code ?? f?.snippet,
      code: f?.code,
      snippet: f?.snippet,
    };
  });

  const notificationRaw =
    payload?.notification ??
    payload?.pocNotification ??
    payload?.notify ??
    undefined;

  const githubRaw =
    payload?.github ??
    payload?.poc?.github ??
    undefined;

  const githubWarningRaw =
    payload?.githubWarning ??
    payload?.poc?.githubWarning ??
    undefined;

  return {
    pocDraft: {
      summary: String(draftRaw.summary ?? ''),
      backendPlan: toArray(draftRaw.backendPlan),
      frontendPlan: toArray(draftRaw.frontendPlan),
      files,
      aiStudioLink: draftRaw.aiStudioLink ? String(draftRaw.aiStudioLink) : undefined,
    },
    notification: notificationRaw
      ? {
          status: notificationRaw.status ? String(notificationRaw.status) : undefined,
          message: notificationRaw.message ? String(notificationRaw.message) : undefined,
          email: notificationRaw.email ? String(notificationRaw.email) : undefined,
          sentAt: notificationRaw.sentAt ? String(notificationRaw.sentAt) : undefined,
          delivered:
            typeof notificationRaw.delivered === 'boolean'
              ? notificationRaw.delivered
              : undefined,
        }
      : undefined,
    github: githubRaw
      ? {
          prUrl: githubRaw.prUrl ? String(githubRaw.prUrl) : undefined,
          prNumber:
            typeof githubRaw.prNumber === 'number' || typeof githubRaw.prNumber === 'string'
              ? githubRaw.prNumber
              : undefined,
          branch: githubRaw.branch ? String(githubRaw.branch) : undefined,
          owner: githubRaw.owner ? String(githubRaw.owner) : undefined,
          repo: githubRaw.repo ? String(githubRaw.repo) : undefined,
        }
      : undefined,
    githubWarning: githubWarningRaw ? String(githubWarningRaw) : undefined,
  };
}

export default function LiveView({ onGraphUpdate, onLog, onConceptMapUpdate, onTurnComplete, onMinimize, onClose }: LiveViewProps) {
  const { session, loading, initializeSession } = useSessionContext();
  const [userInput, setUserInput] = useState('');
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [captureHandle, setCaptureHandle] = useState<{ stop: () => Promise<string> } | null>(null);
  const pendingStopRef = useRef(false);
  const voiceTranscriptRef = useRef('');
  const messagesRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const replyRef = useRef('');
  const lastUserMessageRef = useRef('');
  const [stableConceptMap, setStableConceptMap] = useState<Record<string, string[]>>({});
  const [selectedTechStack, setSelectedTechStack] = useState<string[]>(['Node.js', 'React']);
  const [productType, setProductType] = useState('SaaS');
  const [targetUsers, setTargetUsers] = useState('Startup founders');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [aiStudioLink, setAiStudioLink] = useState('');
  const [aiStudioApiKey, setAiStudioApiKey] = useState('');
  const [rememberApiKey, setRememberApiKey] = useState(false);
  const [userEditedIdea, setUserEditedIdea] = useState(false);
  const [userEditedStack, setUserEditedStack] = useState(false);
  const [userEditedTargetUsers, setUserEditedTargetUsers] = useState(false);
  const [userEditedProductType, setUserEditedProductType] = useState(false);
  const [pocIdea, setPocIdea] = useState('');
  const [pocLoading, setPocLoading] = useState(false);
  const [pocHydrating, setPocHydrating] = useState(false);
  const [pocError, setPocError] = useState<string | null>(null);
  const [pocGenerated, setPocGenerated] = useState(false);
  const [pocData, setPocData] = useState<PocView | null>(null);
  const [resendingNotification, setResendingNotification] = useState(false);
  const [showPocPanel, setShowPocPanel] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [exportingPoc, setExportingPoc] = useState(false);
  const [githubConnection, setGithubConnection] = useState<GithubStatusResponse | null>(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [savingGithubRepo, setSavingGithubRepo] = useState(false);
  const [githubStatusError, setGithubStatusError] = useState<string | null>(null);
  const [githubOauthStatus, setGithubOauthStatus] = useState<string | null>(null);
  const [githubDefaultOwnerInput, setGithubDefaultOwnerInput] = useState('');
  const [githubDefaultRepoInput, setGithubDefaultRepoInput] = useState('');
  const [showGithubModal, setShowGithubModal] = useState(false);
  const previousPocIntentRef = useRef(false);
  const autoPocTriggeredRef = useRef(false);
  const githubOauthWindowRef = useRef<Window | null>(null);
  const githubPollIntervalRef = useRef<number | null>(null);
  const [showGenerateCta, setShowGenerateCta] = useState(false);
  const [showPocWorkspace, setShowPocWorkspace] = useState(false);
  const [generationRequested, setGenerationRequested] = useState(false);
  const [showPocDetails, setShowPocDetails] = useState(true);

  const lastGraphSignatureRef = useRef<string>('');

  const pushGraphUpdate = useCallback(
    (map?: Record<string, string[]> | null) => {
      if (!onGraphUpdate) return;
      const normalized = normalizeConceptMap(map || {});
      if (!normalized || Object.keys(normalized).length === 0) return;

      const signature = JSON.stringify(normalized);
      if (signature === lastGraphSignatureRef.current) return;
      lastGraphSignatureRef.current = signature;

      const rootNode: Node = { id: 'root', label: 'ROOT', type: 'root', x: 0, y: 0 };
      const conceptNodes: Node[] = [];
      const valueNodes: Node[] = [];
      const edges: Edge[] = [];

      Object.entries(normalized).forEach(([concept, values], conceptIdx) => {
        const conceptId = `concept-${conceptIdx}`;
        conceptNodes.push({ id: conceptId, label: concept, type: 'concept' });
        edges.push({ source: 'root', target: conceptId });
        if (Array.isArray(values) && values.length > 0) {
          values.forEach((value, valueIdx) => {
            const valueId = `value-${conceptIdx}-${valueIdx}`;
            valueNodes.push({ id: valueId, label: value, type: 'action' });
            edges.push({ source: conceptId, target: valueId });
          });
        }
      });

      onGraphUpdate({
        nodes: [rootNode, ...conceptNodes, ...valueNodes],
        edges,
      });
    },
    [onGraphUpdate]
  );

  const handleDone = useCallback(
    (data: {
      conceptMap: Record<string, string[]>;
      feasibilitySignal?: number;
      poc?: unknown;
      prUrl?: string;
      prompt?: string;
    }) => {
      const mapToRender = filterConceptMapToCurrentFlow(data.conceptMap, messagesRef.current, '');
      pushGraphUpdate(mapToRender);
      onTurnComplete?.();
      if (data.prompt && /generate the poc/i.test(data.prompt)) {
        setShowGenerateCta(true);
      }
      if (data.poc) {
        const parsed = normalizePocResponse(data.poc);
        if (parsed) {
          setPocData(parsed);
          setPocGenerated(true);
          if (data.prUrl) {
            setGithubOauthStatus(`PR opened: ${data.prUrl}`);
            setGithubConnection((prev) =>
              prev
                ? { ...prev, defaultOwner: prev.defaultOwner || githubDefaultOwnerInput, defaultRepo: prev.defaultRepo || githubDefaultRepoInput }
                : prev
            );
          }
        }
      }
    },
    [pushGraphUpdate, onTurnComplete, githubDefaultOwnerInput, githubDefaultRepoInput]
  );

  const {
    connecting,
    connected,
    ready,
    messages,
    reply,
    conceptMap,
    feasibilitySignal,
    error,
    connect,
    disconnect,
    sendText,
    sendAudio,
    clearError,
  } = useLiveAgent(handleDone);

  useEffect(() => {
    messagesRef.current = messages;
    replyRef.current = reply;
    const latestUser = messages
      .slice()
      .reverse()
      .find((m) => m.role === 'user' && m.content.trim());
    if (latestUser?.content) {
      lastUserMessageRef.current = latestUser.content.trim();
    }

  }, [messages, reply]);

  const deriveProductType = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('marketplace')) return 'Marketplace';
    if (lower.includes('mobile')) return 'Mobile';
    if (lower.includes('web')) return 'Web';
    if (lower.includes('desktop')) return 'Desktop';
    if (lower.includes('cli') || lower.includes('command line')) return 'CLI';
    if (lower.includes('internal')) return 'Internal Tool';
    if (lower.includes('api')) return 'API Product';
    if (lower.includes('saas')) return 'SaaS';
    return null;
  };

  const deriveTargetUsers = (text: string) => {
    const match = text.match(/\bfor\s+([^.?!,\n]+?)(?:$|[.?!,\n])/i);
    return match?.[1]?.trim() || '';
  };

  const deriveTechStack = (text: string) => {
    const lower = text.toLowerCase();
    const candidates = TECH_STACK_OPTIONS.filter((t) =>
      lower.includes(t.toLowerCase().replace(/\.js$/, ''))
    );
    return candidates;
  };

  const focusedConceptMap = filterConceptMapToCurrentFlow(conceptMap, messages, '');
  const getLatestUserMessage = useCallback(() => {
    if (lastUserMessageRef.current.trim()) return lastUserMessageRef.current.trim();
    for (let i = messagesRef.current.length - 1; i >= 0; i -= 1) {
      const m = messagesRef.current[i];
      if (m.role === 'user' && m.content.trim()) return m.content.trim();
    }
    return '';
  }, []);

  const isAgentWorking =
    connecting || !ready || !!reply?.trim() || pocLoading || pocHydrating;
  const ideaFromChat = pocIdea.trim() || getLatestUserMessage();
  const autoTargetUsers =
    userEditedTargetUsers ? targetUsers : deriveTargetUsers(getLatestUserMessage()) || targetUsers;
  const autoProductType =
    userEditedProductType ? productType : deriveProductType(getLatestUserMessage()) || productType;
  const autoTechStack =
    userEditedStack && selectedTechStack.length > 0
      ? selectedTechStack
      : deriveTechStack(getLatestUserMessage()).length > 0
        ? deriveTechStack(getLatestUserMessage())
        : selectedTechStack;
  useEffect(() => {
    if (Object.keys(focusedConceptMap).length > 0) {
      setStableConceptMap(focusedConceptMap);
    }
  }, [focusedConceptMap]);

  useEffect(() => {
    const mapToRender = Object.keys(stableConceptMap).length > 0 ? stableConceptMap : conceptMap;
    pushGraphUpdate(mapToRender);
  }, [stableConceptMap, conceptMap, pushGraphUpdate]);

  useEffect(() => {
    setStableConceptMap({});
    lastGraphSignatureRef.current = '';
  }, [session?.id]);

  useEffect(() => {
    const latest = getLatestUserMessage();
    // only set missing fields once; do not overwrite user edits or existing values
    if (!userEditedIdea && !pocIdea.trim() && latest) {
      setPocIdea(latest);
    }
    if (!userEditedTargetUsers && !targetUsers.trim()) {
      const derived = deriveTargetUsers(latest);
      if (derived) setTargetUsers(derived);
    }
    if (!userEditedProductType && !productType) {
      const derived = deriveProductType(latest);
      if (derived) setProductType(derived);
    }
    if (!userEditedStack && selectedTechStack.length === 0) {
      const derived = parseStackFromText(latest);
      if (derived.length > 0) setSelectedTechStack(derived);
    }
  }, [
    getLatestUserMessage,
    pocIdea,
    userEditedIdea,
    userEditedProductType,
    userEditedStack,
    userEditedTargetUsers,
    targetUsers,
    productType,
    selectedTechStack.length,
  ]);

  const hasPocDiscussion =
    messages.some((m) => hasPocIntent(m.content)) || hasPocIntent(reply);

  useEffect(() => {
    setShowPocPanel(hasPocDiscussion);
    previousPocIntentRef.current = hasPocDiscussion;
  }, [hasPocDiscussion]);

  useEffect(() => {
    setShowGenerateCta(
      !pocLoading &&
        !generationRequested &&
        !pocGenerated &&
        !![...messages].reverse().find(
          (m) =>
            m.role === 'assistant' &&
            /shall i generate|should i generate|ready to generate|generate the poc/i.test(m.content)
        )
    );
  }, [messages, pocLoading, generationRequested, pocGenerated]);

  useEffect(() => {
    autoPocTriggeredRef.current = false;
  }, [session?.id]);

  useEffect(() => {
    if (session?.id) {
      setIsChatExpanded(true);
    } else {
      setIsChatExpanded(false);
      setShowGithubModal(false);
      setShowPocPanel(false);
      previousPocIntentRef.current = false;
      autoPocTriggeredRef.current = false;
    }
  }, [session?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(AI_STUDIO_API_KEY_STORAGE_KEY);
    if (stored) {
      setAiStudioApiKey(stored);
      setRememberApiKey(true);
    } else {
      const envKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
      if (envKey) {
        setAiStudioApiKey(envKey);
        setRememberApiKey(false);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (rememberApiKey && aiStudioApiKey.trim()) {
      window.localStorage.setItem(AI_STUDIO_API_KEY_STORAGE_KEY, aiStudioApiKey.trim());
    } else {
      window.localStorage.removeItem(AI_STUDIO_API_KEY_STORAGE_KEY);
    }
  }, [rememberApiKey, aiStudioApiKey]);

  const toggleTech = (tech: string) => {
    setUserEditedStack(true);
    setSelectedTechStack((prev) =>
      prev.includes(tech)
        ? prev.filter((t) => t !== tech)
        : [...prev, tech]
    );
  };

  const refreshGithubStatus = useCallback(async () => {
    setGithubLoading(true);
    setGithubStatusError(null);
    try {
      const status = await getGithubStatus();
      const ownerToUse = status.defaultOwner || status.login || '';
      const repoToUse = status.defaultRepo || '';

      setGithubConnection(status);
      setGithubDefaultOwnerInput(ownerToUse);
      setGithubDefaultRepoInput(repoToUse);
      if (status.connected) {
        setGithubOauthStatus(
          ownerToUse && repoToUse
            ? `GitHub connected. Default repo set to ${ownerToUse}/${repoToUse}.`
            : 'GitHub connected successfully.'
        );
      }
      return status;
    } catch (e) {
      const message = e instanceof Error ? redactSensitive(e.message) : 'Failed to load GitHub status';
      setGithubStatusError(message);
      return null;
    } finally {
      setGithubLoading(false);
    }
  }, []);

  const handleSaveDefaultRepo = useCallback(async () => {
    const owner = githubDefaultOwnerInput.trim();
    const repo = githubDefaultRepoInput.trim();

    if (!owner || !repo) {
      setGithubStatusError('Default owner and repo are required.');
      return null;
    }

    setSavingGithubRepo(true);
    setGithubStatusError(null);
    try {
      const status = await setGithubDefaultRepo({ owner, repo });
      const ownerToUse = status.defaultOwner || owner;
      const repoToUse = status.defaultRepo || repo;
      setGithubConnection(status);
      setGithubDefaultOwnerInput(ownerToUse);
      setGithubDefaultRepoInput(repoToUse);
      setGithubOauthStatus(`Default repo saved as ${ownerToUse}/${repoToUse}.`);
      return status;
    } catch (e) {
      const message =
        e instanceof Error ? redactSensitive(e.message) : 'Failed to save default GitHub repo';
      setGithubStatusError(message);
      return null;
    } finally {
      setSavingGithubRepo(false);
    }
  }, [githubDefaultOwnerInput, githubDefaultRepoInput]);

  const hydratePoc = useCallback(async () => {
    if (!session?.id) return;
    setPocHydrating(true);
    setPocError(null);
    try {
      const raw = await getSessionPoc(session.id);
      const parsed = normalizePocResponse(raw);
      setPocData(parsed);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load POC';
      if (!message.toLowerCase().includes('not found') && !message.includes('404')) {
        setPocError(message);
      }
      setPocData(null);
    } finally {
      setPocHydrating(false);
    }
  }, [session?.id]);

  useEffect(() => {
    if (!session?.id) {
      setPocData(null);
      setPocError(null);
      setPocHydrating(false);
      return;
    }
    void hydratePoc();
  }, [session?.id, hydratePoc]);

  useEffect(() => {
    void refreshGithubStatus();
  }, [refreshGithubStatus]);

  async function handleGeneratePoc(options?: { stack?: string[]; idea?: string; target?: string; product?: string; skipFieldGuards?: boolean }) {
    if (!session?.id) return;
    setGenerationRequested(true);
    const techStackToSend = options?.stack ?? (userEditedStack ? selectedTechStack : autoTechStack);
    const ideaForPoc = (options?.idea ?? ideaFromChat).trim();
    const targetUsersToSend =
      typeof options?.target === 'string'
        ? options.target.trim()
        : userEditedTargetUsers
          ? targetUsers.trim()
          : autoTargetUsers.trim();
    const productTypeToSend =
      options?.product !== undefined
        ? options.product
        : userEditedProductType
          ? productType
          : autoProductType;

    if (techStackToSend.length === 0) {
      setPocError('Pick a tech stack before generating a POC.');
      return;
    }
    if (!options?.skipFieldGuards && !ideaForPoc) {
      setPocError('Need an idea from the conversation before generating a POC.');
      return;
    }
    autoPocTriggeredRef.current = true;
    setPocError(null);
    setPocLoading(true);
    try {
      if (githubConnection?.connected) {
        const currentOwner = githubConnection.defaultOwner?.trim();
        const currentRepo = githubConnection.defaultRepo?.trim();
        const desiredOwner = githubDefaultOwnerInput.trim();
        const desiredRepo = githubDefaultRepoInput.trim();

        if (!desiredOwner || !desiredRepo) {
          throw new Error('GitHub default owner and repo are required before generating the POC.');
        }

        if (currentOwner !== desiredOwner || currentRepo !== desiredRepo) {
          const savedStatus = await handleSaveDefaultRepo();
          if (!savedStatus?.defaultOwner || !savedStatus.defaultRepo) {
            throw new Error('Unable to save the default GitHub repo before generating the POC.');
          }
        }
      }

      let referenceLinks: Array<{ title: string; url: string; snippet?: string }> = [];
      try {
        referenceLinks = await buildReferenceLinks(ideaForPoc);
      } catch {
        referenceLinks = [];
      }

      const payload: PocPayload = {
        techStack: techStackToSend,
        productType: productTypeToSend,
        targetUsers: targetUsersToSend,
        notificationEmail,
        aiStudioLink: aiStudioLink.trim() || undefined,
        referenceLinks,
      };
      payload.idea = ideaForPoc;
      if (!githubConnection?.defaultOwner && githubDefaultOwnerInput) {
        (payload as any).owner = githubDefaultOwnerInput;
      }
      if (!githubConnection?.defaultRepo && githubDefaultRepoInput) {
        (payload as any).repo = githubDefaultRepoInput;
      }

      const raw = await createSessionPoc(session.id, payload);
      const parsed = normalizePocResponse(raw);
      if (!parsed) throw new Error('POC response missing draft payload.');
      setPocData(parsed);
      setPocGenerated(true);
      setGenerationRequested(false);
      if (parsed.github?.prUrl) {
        setGithubOauthStatus(
          `PR #${parsed.github.prNumber ?? ''} created${parsed.github.owner && parsed.github.repo ? ` in ${parsed.github.owner}/${parsed.github.repo}` : ''}.`
            .replace(/\s+\./, '.')
            .trim()
        );
      }
      onLog?.({
        role: 'system',
        text: 'POC generated successfully.',
        timestamp: new Date(),
      });
    } catch (e) {
      const message = e instanceof Error ? redactSensitive(e.message) : 'Failed to generate POC';
      setPocError(message || 'Failed to generate POC. Please verify inputs and try again.');
    } finally {
      setPocLoading(false);
      setGenerationRequested(false);
    }
  }

  const handleResendNotification = async () => {
    if (!session?.id) return;
    setResendingNotification(true);
    setPocError(null);
    try {
      const raw = await resendSessionPocNotification(session.id);
      const parsed = normalizePocResponse(raw);
      if (parsed?.notification) {
        setPocData((prev) => (prev ? { ...prev, notification: parsed.notification } : prev));
      }
      onLog?.({
        role: 'system',
        text: 'POC notification resend requested.',
        timestamp: new Date(),
      });
    } catch (e) {
      const message = e instanceof Error ? redactSensitive(e.message) : 'Failed to resend notification';
      setPocError(message.includes('Failed') ? message : 'Failed to resend notification.');
    } finally {
      setResendingNotification(false);
    }
  };

  const canGeneratePoc = ideaFromChat.trim().length > 0 && selectedTechStack.length > 0 && !pocLoading;

  const getFileName = (file: PocFileSnippet, idx: number) =>
    file.path || file.filename || `snippet-${idx + 1}.txt`;

  const getFileContent = (file: PocFileSnippet) =>
    file.content || file.code || file.snippet || '';

  const buildAllFilesText = (files: PocFileSnippet[]) =>
    files
      .map((file, idx) => {
        const name = getFileName(file, idx);
        const code = getFileContent(file);
        return `// FILE: ${name}\n${code}`;
      })
      .join('\n\n');

  const handleCopyAllFiles = async () => {
    const files = pocData?.pocDraft?.files || [];
    if (files.length === 0) return;
    try {
      await navigator.clipboard.writeText(buildAllFilesText(files));
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1800);
    } catch {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 1800);
    }
  };

  const handleDownloadZip = async () => {
    const files = pocData?.pocDraft?.files || [];
    if (files.length === 0) return;
    const zip = new JSZip();
    files.forEach((file, idx) => {
      zip.file(getFileName(file, idx), getFileContent(file));
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mirrormind-poc-files.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleOpenBuild = () => {
    const buildLink = pocData?.pocDraft?.aiStudioLink?.trim() || 'https://aistudio.google.com/apps';
    window.open(buildLink, '_blank', 'noopener,noreferrer');
  };

  const handleExportPoc = async () => {
    if (!session?.id) return;
    setExportingPoc(true);
    setPocError(null);
    try {
      const { blob, fileName } = await exportSessionPoc(session.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName || 'poc-export.zip';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (e) {
      const message = e instanceof Error ? redactSensitive(e.message) : 'Failed to export POC';
      setPocError(message.includes('Failed') ? message : 'Failed to export POC.');
    } finally {
      setExportingPoc(false);
    }
  };

  const handleConnectGithub = () => {
    const oauthUrl = getOauthStartUrl('github');
    const popup = window.open(
      oauthUrl,
      'mirrormind-github-oauth',
      'popup=yes,width=640,height=760,left=120,top=80'
    );

    if (!popup) {
      window.location.href = oauthUrl;
      return;
    }

    githubOauthWindowRef.current = popup;
    setGithubOauthStatus('Waiting for GitHub authorization...');

    if (githubPollIntervalRef.current) {
      window.clearInterval(githubPollIntervalRef.current);
    }

    githubPollIntervalRef.current = window.setInterval(async () => {
      const oauthWindow = githubOauthWindowRef.current;
      const status = await refreshGithubStatus();

      if (status?.connected) {
        setShowGithubModal(true);
        if (oauthWindow && !oauthWindow.closed) oauthWindow.close();
        if (githubPollIntervalRef.current) {
          window.clearInterval(githubPollIntervalRef.current);
          githubPollIntervalRef.current = null;
        }
        githubOauthWindowRef.current = null;
        return;
      }

      if (!oauthWindow || oauthWindow.closed) {
        if (githubPollIntervalRef.current) {
          window.clearInterval(githubPollIntervalRef.current);
          githubPollIntervalRef.current = null;
        }
        githubOauthWindowRef.current = null;
        setGithubOauthStatus((prev) =>
          prev === 'Waiting for GitHub authorization...' ? 'GitHub connection window closed.' : prev
        );
      }
    }, 1500);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== '/auth/github/callback') return;

    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const error = params.get('error');
    const message = params.get('message');

    if (error) {
      setGithubOauthStatus(`GitHub OAuth failed: ${error}`);
    } else if (status === 'success' || message) {
      setGithubOauthStatus(message || 'GitHub connected successfully.');
      void refreshGithubStatus();
    } else {
      setGithubOauthStatus('GitHub OAuth callback received.');
    }

    window.history.replaceState({}, '', '/');
  }, [refreshGithubStatus]);

  useEffect(() => {
    return () => {
      if (githubPollIntervalRef.current) {
        window.clearInterval(githubPollIntervalRef.current);
      }
      if (githubOauthWindowRef.current && !githubOauthWindowRef.current.closed) {
        githubOauthWindowRef.current.close();
      }
    };
  }, []);

  const replyEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    replyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, reply]);

  useEffect(() => {
    onConceptMapUpdate?.(
      Object.keys(focusedConceptMap).length > 0 ? focusedConceptMap : stableConceptMap,
      feasibilitySignal ?? null
    );
  }, [focusedConceptMap, stableConceptMap, feasibilitySignal, onConceptMapUpdate]);

  const handleSendText = () => {
    const trimmed = userInput.trim();
    if (!trimmed) return;
    if (session) onLog?.({ role: 'user', text: trimmed, timestamp: new Date() });
    lastUserMessageRef.current = trimmed;
    sendText(trimmed);
    setUserInput('');
  };

  const handleMicPressStart = async () => {
    if (!connected || !ready) {
      return;
    }
    pendingStopRef.current = false;
    voiceTranscriptRef.current = '';
    try {
      // Optional browser-side speech recognition for showing what the user said.
      const SpeechRecognitionAPI =
        (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (SpeechRecognitionAPI) {
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.onresult = (event: any) => {
          const result = event.results[event.results.length - 1];
          const transcript = result[0]?.transcript ?? '';
          voiceTranscriptRef.current = transcript;
        };
        recognition.start();
      }

      const handle = await startMicCapture();
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        try {
          const base64 = await handle.stop();
          if (base64) {
            sendAudio(base64, 'audio/pcm;rate=16000', voiceTranscriptRef.current);
          }
        } catch (err) {
          // ignore late stop errors from mic capture
        }
        return;
      }
      setCaptureHandle(handle);
      setRecording(true);
    } catch (e) {
      // ignore microphone access errors; UI will show failure state
      onLog?.({
        role: 'system',
        text: 'Microphone access failed: ' + (e instanceof Error ? e.message : 'Unknown'),
        timestamp: new Date(),
      });
    }
  };

  const handleMicPressEnd = async () => {
    if (!captureHandle || !recording) {
      // Mark that a stop was requested before the capture handle became available.
      pendingStopRef.current = true;
      return;
    }
    pendingStopRef.current = false;
    setRecording(false);
    try {
      const base64 = await captureHandle.stop();
      setCaptureHandle(null);
      if (base64) {
        if (voiceTranscriptRef.current.trim()) {
          lastUserMessageRef.current = voiceTranscriptRef.current.trim();
        }
        sendAudio(base64, 'audio/pcm;rate=16000', voiceTranscriptRef.current);
      }
    } catch (err) {
      // ignore mic capture/stream errors; UI already reflects failure
    }
  };

  const handleMicToggle = async () => {
    if (recording) {
      await handleMicPressEnd();
    } else {
      await handleMicPressStart();
    }
  };

  const renderConversation = (expanded = false) => (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] ${expanded ? 'min-h-[320px] max-h-[42vh] xl:max-h-[48vh]' : 'flex-1'}`}>
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-gray-500">Conversation</div>
              <div className="text-[11px] text-gray-500">Live agent chat</div>
            </div>
            {isAgentWorking && (
              <div className="flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-100">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                <span>Thinking</span>
              </div>
            )}
          </div>
          {!expanded && (
            <button
              type="button"
              onClick={() => setIsChatExpanded(true)}
              className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-wider text-gray-200 hover:bg-white/10"
            >
              Open chat popup
            </button>
          )}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto px-4 ${expanded ? 'py-4' : 'py-4'}`}>
        {(Object.keys(stableConceptMap).length > 0 || feasibilitySignal != null) && (
          <div className="mb-4 rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Current topic</div>
            {Object.keys(stableConceptMap).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(stableConceptMap).map(([concept, terms]) => (
                  <div key={concept} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                    <div className="text-xs font-semibold text-white">{concept}</div>
                    {terms.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {terms.map((term, idx) => (
                          <span key={idx} className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[11px] text-gray-300">
                            {term}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.length === 0 && !reply && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm leading-6 text-white/60">
            {connected
              ? ready
                ? 'Type a message or hold the mic button to talk. Replies will appear here as the session runs.'
                : 'Connected. Waiting for the agent to finish booting.'
              : 'Connect Live to start a real-time voice or text conversation.'}
          </div>
        )}

        <div className="space-y-4">
          {messages.map((m, i) => {
            const split = m.role === 'assistant' ? splitAssistantContent(m.content) : { response: '', thoughts: '' };
            const assistantDisplay =
              m.role === 'assistant'
                ? (split.response && split.response.trim()) || m.content
                : '';

            return (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`${expanded ? 'max-w-[82%] xl:max-w-[78%]' : 'max-w-[92%]'} space-y-2`}>
                  <div className="px-1 text-[11px] uppercase tracking-[0.22em] text-gray-500">
                    {m.role === 'user' ? 'You' : 'Agent'}
                  </div>
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-6 whitespace-pre-wrap break-words ${
                      m.role === 'user'
                        ? 'border-white/15 bg-white/10 text-white'
                        : 'border-white/10 bg-black/30 text-white/95'
                    }`}
                  >
                    {m.role === 'assistant' ? (assistantDisplay || 'Open Thoughts to view agent reasoning.') : m.content}
                  </div>
                  {m.role === 'assistant' &&
                    showGenerateCta &&
                    /shall i generate|should i generate|ready to generate|generate the poc/i.test(m.content) && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleGeneratePoc()}
                            disabled={!canGeneratePoc || pocLoading}
                            className="rounded-xl border border-blue-400/40 bg-blue-500/15 px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-100 hover:bg-blue-500/25 disabled:opacity-50"
                          >
                            {pocLoading ? 'Generating POC...' : 'Generate POC'}
                          </button>
                          {pocLoading && (
                            <span className="flex items-center gap-1 text-xs text-blue-100">
                              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-transparent" />
                              Generating POC… you can keep chatting.
                            </span>
                          )}
                        </div>
                        {pocError && <div className="text-xs text-red-300">{pocError}</div>}
                      </div>
                    )}
                  {m.role === 'assistant' && split.thoughts && (
                    <details className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                      <summary className="cursor-pointer select-none text-[11px] uppercase tracking-[0.22em] text-gray-300">
                        Thoughts
                      </summary>
                      <div className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-gray-300">
                        {split.thoughts}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })}

          {reply && (() => {
            const split = splitAssistantContent(reply);
            const replyDisplay = (split.response && split.response.trim()) || reply;

            return (
              <div className="flex justify-start">
                <div className={`${expanded ? 'max-w-[82%] xl:max-w-[78%]' : 'max-w-[92%]'} space-y-2`}>
                  <div className="px-1 text-[11px] uppercase tracking-[0.22em] text-gray-500">Agent</div>
                  <div className="rounded-2xl border border-blue-400/20 bg-blue-500/[0.08] px-4 py-3 text-sm leading-6 text-white whitespace-pre-wrap break-words">
                    {replyDisplay}
                  </div>
                  {split.thoughts && (
                    <details className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                      <summary className="cursor-pointer select-none text-[11px] uppercase tracking-[0.22em] text-gray-300">
                        Thoughts
                      </summary>
                      <div className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-gray-300">
                        {split.thoughts}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })()}

          <div ref={replyEndRef} />
        </div>
      </div>
    </div>
  );

  const renderComposer = (expanded = false) => (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-3 ${expanded ? 'bg-black/70' : ''}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Composer</div>
        <div className="text-[11px] text-gray-500">Enter sends, Shift+Enter adds a new line</div>
      </div>

      <div className={`flex ${expanded ? 'flex-col gap-3 xl:flex-row' : 'gap-3'}`}>
        <textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendText();
            }
          }}
          rows={expanded ? 4 : 3}
          placeholder={ready ? 'Type your next message...' : 'Wait for the agent to become ready...'}
          disabled={!connected || !ready}
          className="min-h-[120px] flex-1 resize-none rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-sm leading-6 text-white placeholder-gray-500 focus:outline-none focus:border-white/40 disabled:opacity-50"
        />

        <div className={`flex ${expanded ? 'w-full xl:w-40' : 'w-28'} shrink-0 flex-col gap-3`}>
          <button
            type="button"
            onClick={handleSendText}
            disabled={!connected || !ready || !userInput.trim()}
            className="flex h-12 items-center justify-center rounded-2xl bg-white px-4 text-xs font-bold uppercase tracking-wider text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleMicToggle()}
            disabled={!connected || !ready}
            className={`flex h-12 items-center justify-center rounded-2xl border transition-colors ${
              recording
                ? 'border-red-500/50 bg-red-500/20'
                : 'border-white/15 bg-black/30 hover:bg-white/10'
            } disabled:opacity-50`}
            title={recording ? 'Tap to stop' : 'Tap to record'}
          >
            {recording ? <MicOff className="h-5 w-5 text-red-300" /> : <Mic className="h-5 w-5 text-white" />}
          </button>
          <div className="text-center text-[11px] leading-4 text-gray-500">
            {recording ? 'Recording... tap to stop' : 'Tap mic to talk'}
          </div>
        </div>
      </div>
    </div>
  );

  const renderPocWorkspace = () => (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-gray-400">Idea</label>
          <input
            value={pocIdea}
            onChange={(e) => {
              setUserEditedIdea(true);
              setPocIdea(e.target.value);
            }}
            placeholder="Leave empty to use latest user message"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-gray-400">AI Studio Link</label>
          <input
            value={aiStudioLink}
            onChange={(e) => setAiStudioLink(e.target.value)}
            placeholder="https://aistudio.google.com/app/prompts/..."
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-gray-400">Product Type</label>
          <select
            value={productType}
            onChange={(e) => {
              setUserEditedProductType(true);
              setProductType(e.target.value);
            }}
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
          >
            {PRODUCT_TYPES.map((type) => (
              <option key={type} value={type} className="bg-black">
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-gray-400">Target Users</label>
          <input
            value={targetUsers}
            onChange={(e) => {
              setUserEditedTargetUsers(true);
              setTargetUsers(e.target.value);
            }}
            placeholder="Startup founders"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/40"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-[11px] uppercase tracking-wider text-gray-400">Notification Email</label>
          <input
            type="email"
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/40"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-gray-400">Tech Stack</div>
        <div className="flex flex-wrap gap-2">
          {TECH_STACK_OPTIONS.map((tech) => {
            const selected = selectedTechStack.includes(tech);
            return (
              <button
                key={tech}
                type="button"
                onClick={() => toggleTech(tech)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  selected
                    ? 'border-blue-400/50 bg-blue-500/20 text-blue-200'
                    : 'border-white/15 bg-white/[0.04] text-gray-300 hover:bg-white/10'
                }`}
              >
                {tech}
              </button>
            );
          })}
        </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleGeneratePoc()}
            disabled={!canGeneratePoc}
            className="rounded-xl border border-blue-400/40 bg-blue-500/15 px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-200 hover:bg-blue-500/25 disabled:opacity-50"
            title="Generate POC"
          >
            {pocLoading ? 'Generating POC...' : 'Generate POC'}
          </button>
          <button
            type="button"
            onClick={hydratePoc}
            disabled={pocHydrating}
            className="rounded-xl border border-white/15 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-200 hover:bg-white/10 disabled:opacity-50"
          >
            {pocHydrating ? 'Refreshing...' : 'Refresh POC'}
          </button>
          {pocError && <span className="text-xs text-red-300">{pocError}</span>}
        </div>
    </div>
  );

  const renderPocDetails = () => {
    if (!pocData) return null;

    return (
      <div className="space-y-3 p-4">
        {pocData?.notification && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs">
            <Bell className="h-4 w-4 text-blue-300" />
            <span className="text-white">
              Notification: <strong>{pocData.notification.status || 'sent'}</strong>
            </span>
            {pocData.notification.email && <span className="text-gray-300">to {pocData.notification.email}</span>}
            {pocData.notification.message && <span className="text-gray-400">{pocData.notification.message}</span>}
            <button
              type="button"
              onClick={handleResendNotification}
              disabled={resendingNotification}
              className="ml-auto rounded-xl border border-blue-400/40 px-3 py-1 text-xs text-blue-200 hover:bg-blue-500/15 disabled:opacity-50"
            >
              {resendingNotification ? 'Resending...' : 'Resend'}
            </button>
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">POC</div>
              {pocData.pocDraft.summary && (
                <div className="text-sm text-white mt-1">{pocData.pocDraft.summary}</div>
              )}
            </div>
            {pocData.github?.prUrl && (
              <a
                href={pocData.github.prUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-green-400/40 bg-green-500/10 px-3 py-1 text-xs text-green-100 hover:bg-green-500/20"
              >
                View PR
              </a>
            )}
          </div>
          {pocData.pocDraft.files?.length ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-gray-200">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-2">Key Files</div>
              <ul className="list-disc list-inside space-y-1">
                {pocData.pocDraft.files.slice(0, 8).map((f, idx) => (
                  <li key={idx}>{f.filename || f.path || 'file'}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {pocData.notification?.email && (
            <div className="text-xs text-gray-300">
              Notifications will go to: <span className="text-white">{pocData.notification.email}</span>
              {notificationEmail && notificationEmail !== pocData.notification.email
                ? ` (plus ${notificationEmail})`
                : ''}
            </div>
          )}
        </div>

        {(pocData?.github || pocData?.githubWarning) && (
          <div
            className={`rounded-2xl border p-3 ${
              pocData.github
                ? 'border-green-500/25 bg-green-500/10'
                : 'border-amber-500/25 bg-amber-500/10'
            }`}
          >
            <div className="text-[11px] uppercase tracking-wider text-gray-300">GitHub PR</div>
            {pocData.github ? (
              <div className="mt-2 space-y-2 text-sm text-white/90">
                <p>
                  PR #{pocData.github.prNumber ?? 'created'}
                  {pocData.github.owner && pocData.github.repo
                    ? ` in ${pocData.github.owner}/${pocData.github.repo}`
                    : ''}
                  {pocData.github.branch ? ` on branch ${pocData.github.branch}` : ''}.
                </p>
                {pocData.github.prUrl && (
                  <a
                    href={pocData.github.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-green-200 underline underline-offset-4"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open pull request
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-amber-200">{pocData.githubWarning}</p>
            )}
          </div>
        )}

        {pocData?.pocDraft && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleOpenBuild}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-400/40 bg-blue-500/15 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-500/25"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in AI Studio Build
              </button>
              <button
                type="button"
                onClick={handleExportPoc}
                disabled={exportingPoc}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {exportingPoc ? 'Exporting...' : 'Download export'}
              </button>
              <button
                type="button"
                onClick={handleCopyAllFiles}
                disabled={(pocData.pocDraft.files || []).length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10 disabled:opacity-50"
              >
                <Copy className="h-3.5 w-3.5" />
                {copyStatus === 'copied' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy all'}
              </button>
              <button
                type="button"
                onClick={handleDownloadZip}
                disabled={(pocData.pocDraft.files || []).length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                ZIP
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] uppercase tracking-wider text-gray-400">Summary</div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-white/90">{pocData.pocDraft.summary}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] uppercase tracking-wider text-gray-400">Backend Plan</div>
                <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-white/90">
                  {pocData.pocDraft.backendPlan.map((item, idx) => (
                    <li key={`be-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] uppercase tracking-wider text-gray-400">Frontend Plan</div>
                <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-white/90">
                  {pocData.pocDraft.frontendPlan.map((item, idx) => (
                    <li key={`fe-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGithubPanel = () => (
    <div className="overflow-hidden rounded-[28px] border border-white/15 bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <button
        type="button"
        onClick={() => setShowGithubModal(true)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.04]"
      >
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-300/70">
            <ExternalLink className="h-4 w-4 text-sky-200" />
            GitHub
          </div>
          <p className="mt-2 text-sm text-slate-200">
            {githubConnection?.connected
              ? `Connected${githubConnection.login ? ` as ${githubConnection.login}` : ''}. ${
                  githubConnection.defaultOwner && githubConnection.defaultRepo
                    ? `Default repo: ${githubConnection.defaultOwner}/${githubConnection.defaultRepo}.`
                    : 'Default repo not set yet.'
                }`
              : 'Connect GitHub once, then Generate POC can create the PR automatically.'}
          </p>
        </div>
        <div className="shrink-0 rounded-2xl border border-white/20 bg-white/[0.07] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-100">
          {githubConnection?.connected ? 'View' : 'Connect'}
        </div>
      </button>
    </div>
  );

  const renderGithubModal = () => (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-lg"
        onClick={() => setShowGithubModal(false)}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-3xl overflow-hidden rounded-[30px] border border-white/20 bg-white/[0.1] shadow-[0_28px_90px_rgba(15,23,42,0.52)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.2),rgba(255,255,255,0.04)_40%,rgba(59,130,246,0.06)_100%)]" />
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        <div className="relative flex items-center justify-between border-b border-white/15 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-300/70">
              <ExternalLink className="h-4 w-4 text-sky-200" />
              GitHub
            </div>
            <p className="mt-2 text-sm text-slate-200">
              Connect GitHub once and the PR will be created during Generate POC.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGithubModal(false)}
            className="rounded-2xl border border-white/20 bg-white/[0.07] p-2.5 text-gray-100 transition-colors hover:bg-white/[0.14]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative space-y-4 p-5">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] uppercase tracking-wider text-gray-400">Connection status</div>
            {githubOauthStatus && (
              <div className="mt-3 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-300">
                {githubOauthStatus}
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                <div className="text-[11px] uppercase tracking-wider text-gray-500">Connected</div>
                <div className="mt-2 text-sm text-white">
                  {githubLoading
                    ? 'Checking...'
                    : githubConnection?.connected
                      ? 'Yes'
                      : 'No'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                <div className="text-[11px] uppercase tracking-wider text-gray-500">GitHub login</div>
                <div className="mt-2 text-sm text-white">{githubConnection?.login || '-'}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                <div className="text-[11px] uppercase tracking-wider text-gray-500">Default owner</div>
                <div className="mt-2 text-sm text-white">{githubConnection?.defaultOwner || '-'}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                <div className="text-[11px] uppercase tracking-wider text-gray-500">Default repo</div>
                <div className="mt-2 text-sm text-white">{githubConnection?.defaultRepo || '-'}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Owner</label>
                <input
                  value={githubDefaultOwnerInput}
                  onChange={(e) => setGithubDefaultOwnerInput(e.target.value)}
                  placeholder="github owner (e.g. your-username)"
                  className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/40"
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Repo</label>
                <input
                  value={githubDefaultRepoInput}
                  onChange={(e) => setGithubDefaultRepoInput(e.target.value)}
                  placeholder="repo name (e.g. my-project)"
                  className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/40"
                />
              </div>
            </div>
            {githubStatusError && (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {githubStatusError}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleConnectGithub}
                className="rounded-xl border border-white/15 px-3 py-2 text-xs text-gray-200 hover:bg-white/10"
              >
                {githubConnection?.connected ? 'Reconnect GitHub' : 'Connect GitHub'}
              </button>
              <button
                type="button"
                onClick={() => void refreshGithubStatus()}
                disabled={githubLoading}
                className="rounded-xl border border-blue-400/40 bg-blue-500/15 px-3 py-2 text-xs text-blue-200 hover:bg-blue-500/25 disabled:opacity-50"
              >
                {githubLoading ? 'Refreshing...' : 'Refresh status'}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveDefaultRepo()}
                disabled={savingGithubRepo || !githubConnection?.connected}
                className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {savingGithubRepo ? 'Saving...' : 'Save default repo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl shadow-2xl p-8 flex flex-col items-center gap-6 text-center">
          <div className="w-12 h-12 rounded-full border border-white/20 bg-white/10 flex items-center justify-center">
            <Radio className="w-6 h-6 text-white/80" />
          </div>
          <div>
            <h3 className="font-bold text-white font-mono text-sm uppercase tracking-wider mb-2">
              Live voice & chat
            </h3>
            <p className="text-gray-400 font-mono text-xs">
              Start a session to talk or type with the agent in real time.
            </p>
          </div>
          <button
            type="button"
            onClick={initializeSession}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/20 border border-white/30 text-white font-mono font-bold uppercase text-xs tracking-wider hover:bg-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            {loading ? 'Starting…' : 'Start session'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {isChatExpanded && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-2 md:p-4">
          <div
            className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.18),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(236,72,153,0.18),_transparent_30%),rgba(6,10,18,0.78)] backdrop-blur-xl"
            onClick={() => setIsChatExpanded(false)}
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-[8%] top-[10%] h-40 w-40 rounded-full bg-cyan-300/10 blur-3xl" />
            <div className="absolute bottom-[12%] right-[10%] h-56 w-56 rounded-full bg-fuchsia-300/10 blur-3xl" />
          </div>
          <div className="relative flex h-[min(92vh,920px)] w-[min(96vw,1700px)] flex-col overflow-hidden rounded-[32px] border border-white/20 bg-white/[0.08] shadow-[0_32px_120px_rgba(15,23,42,0.58)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.03)_35%,rgba(148,163,184,0.06)_100%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
            <div className="relative flex flex-wrap items-start justify-between gap-3 border-b border-white/10 bg-white/[0.04] px-5 py-4">
              <div className="min-w-0 flex-1 pr-2">
                <div className="text-xs uppercase tracking-[0.32em] text-slate-300/70">Live chat</div>
                <div className="mt-1 text-sm text-white">Talk through the idea here. If the user asks for a POC, the build workspace appears below in the same popup.</div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {connected ? (
                  <button
                    type="button"
                    onClick={() => disconnect()}
                    className="rounded-2xl border border-white/20 bg-white/[0.07] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-100 transition-colors hover:bg-white/[0.14]"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => connect(session.id)}
                    disabled={connecting}
                    className="rounded-2xl border border-sky-300/30 bg-sky-400/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100 transition-colors hover:bg-sky-400/25 disabled:opacity-50"
                  >
                    {connecting ? 'Connecting...' : 'Connect Live'}
                  </button>
                )}
                {onMinimize && (
                  <button
                    type="button"
                    onClick={onMinimize}
                    className="rounded-2xl border border-white/20 bg-white/[0.07] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-100 transition-colors hover:bg-white/[0.14]"
                  >
                    -
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (onClose) onClose();
                    else setIsChatExpanded(false);
                  }}
                  className="rounded-2xl border border-white/20 bg-white/[0.07] p-2.5 text-gray-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition-colors hover:bg-white/[0.14]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 md:p-5">
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={clearError} className="shrink-0 underline underline-offset-2">
            Dismiss
          </button>
        </div>
      )}
      {pocGenerated && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-xs text-green-200">
          <span className="min-w-0 flex-1 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-300 animate-pulse" />
            POC generated successfully.
            {pocData?.github?.prUrl && (
              <a
                href={pocData.github.prUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 text-green-100"
              >
                View PR
              </a>
            )}
          </span>
          <button type="button" onClick={() => setPocGenerated(false)} className="shrink-0 underline underline-offset-2">
            Dismiss
          </button>
        </div>
      )}
      {pocError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <span className="min-w-0 flex-1">{pocError}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setPocError(null);
                handleSendText();
              }}
              className="underline underline-offset-2"
            >
              Retry
            </button>
            <button type="button" onClick={() => setPocError(null)} className="underline underline-offset-2">
              Dismiss
            </button>
          </div>
        </div>
      )}
              <div className="grid min-h-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.9fr)] xl:items-start">
                <div className="flex min-h-0 flex-col gap-5">
                  {renderConversation(true)}
                  {renderComposer(true)}
                </div>
                <div className="flex min-h-0 flex-col gap-5">
                  {renderGithubPanel()}
                  {showPocPanel && (
                    <>
                      <div className="overflow-hidden rounded-[28px] border border-white/15 bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                        <div className="border-b border-white/10 px-5 py-4 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-300/70">
                            <Layers className="h-4 w-4 text-sky-200" />
                            POC workspace
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowPocWorkspace((s) => !s)}
                            className="rounded-xl border border-white/20 bg-white/[0.08] px-3 py-1 text-xs uppercase tracking-wider text-white hover:bg-white/15"
                          >
                            {showPocWorkspace ? 'Hide' : 'View'}
                          </button>
                        </div>
                        {showPocWorkspace && (
                          <div className="max-h-[42vh] overflow-y-auto p-1 xl:max-h-[58vh]">{renderPocWorkspace()}</div>
                        )}
                      </div>

                      {pocData && (
                        <div className="overflow-hidden rounded-[28px] border border-white/15 bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                          <div className="border-b border-white/10 px-5 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-300/70">
                              <Layers className="h-4 w-4 text-green-200" />
                              POC details
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowPocDetails((s) => !s)}
                              className="rounded-xl border border-white/20 bg-white/[0.08] px-3 py-1 text-xs uppercase tracking-wider text-white hover:bg-white/15"
                            >
                              {showPocDetails ? 'Hide' : 'View'}
                            </button>
                          </div>
                          {showPocDetails && <div className="max-h-[42vh] overflow-y-auto p-1 xl:max-h-[58vh]">{renderPocDetails()}</div>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            {showGithubModal && renderGithubModal()}
          </div>
        </div>
      )}
    </>
  );

}
