import { useRef, useState, useEffect } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
} from 'framer-motion';
import {
  Brain,
  ChevronDown,
  Zap,
  Code2,
  Check,
  Layout,
  Share2,
  Terminal,
  Fingerprint,
} from 'lucide-react';

interface IntroProps {
  onComplete: () => void;
}

const ScrollFade = ({
  children,
  delay = 0,
}: {
  children?: React.ReactNode;
  delay?: number;
}) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.8, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
};

interface GlassCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  delay: number;
}

const GlassCard: React.FC<GlassCardProps> = ({
  icon: Icon,
  title,
  desc,
  delay,
}) => (
  <ScrollFade delay={delay}>
    <div className="h-full min-h-[320px] p-8 bg-black border border-white/20 hover:border-white transition-all duration-500 group relative overflow-hidden flex flex-col justify-end">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(#404040 1px, transparent 1px)',
          backgroundSize: '8px 8px',
        }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none opacity-50" />
      <div className="absolute top-[-20px] right-[-20px] text-white/5 group-hover:text-white/10 transition-colors duration-500">
        <Icon className="w-48 h-48 stroke-[1px] rotate-12" />
      </div>
      <div className="w-12 h-12 mb-6 bg-white text-black flex items-center justify-center relative z-10">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-xl font-bold mb-4 uppercase tracking-wider font-mono relative z-10 text-white mix-blend-difference">
        {title}
      </h3>
      <p className="text-gray-400 text-xs leading-relaxed font-mono relative z-10">
        {desc}
      </p>
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-white/50" />
    </div>
  </ScrollFade>
);

interface ProtocolStepProps {
  number: string;
  title: string;
  desc: string;
  delay: number;
}

const ProtocolStep: React.FC<ProtocolStepProps> = ({
  number,
  title,
  desc,
  delay,
}) => (
  <ScrollFade delay={delay}>
    <div className="flex gap-6 p-6 border-l border-white/20 hover:border-white hover:bg-white/5 transition-all cursor-crosshair group">
      <div className="text-xl font-mono font-bold text-gray-600 group-hover:text-white transition-colors">
        {number}
      </div>
      <div>
        <h4 className="text-lg font-bold text-white mb-2 uppercase">{title}</h4>
        <p className="text-gray-500 text-sm">{desc}</p>
      </div>
    </div>
  </ScrollFade>
);

interface PricingCardProps {
  title: string;
  price: string;
  features: string[];
  highlight?: boolean;
  delay: number;
}

const PricingCard: React.FC<PricingCardProps> = ({
  title,
  price,
  features,
  highlight = false,
  delay,
}) => (
  <ScrollFade delay={delay}>
    <div
      className={`h-full p-8 border flex flex-col relative transition-all duration-300 backdrop-blur-md ${
        highlight
          ? 'bg-white/10 border-white'
          : 'bg-black/40 border-white/20 hover:border-white/50'
      }`}
    >
      {highlight && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-white text-black px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
          Recommended
        </div>
      )}
      <h3 className="text-sm font-bold uppercase tracking-widest mb-4 text-gray-400">
        {title}
      </h3>
      <div className="text-5xl font-bold mb-8 tracking-tighter">
        {price}
        <span className="text-lg font-normal opacity-50">/mo</span>
      </div>
      <ul className="space-y-4 mb-8 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-3">
            <Check className="w-3 h-3 text-white flex-shrink-0" />
            <span className="text-xs font-bold text-gray-300">{f}</span>
          </li>
        ))}
      </ul>
      <button
        className={`w-full py-4 font-bold border text-xs uppercase tracking-widest hover:opacity-80 transition-all ${
          highlight
            ? 'bg-white text-black border-white'
            : 'bg-transparent text-white border-white hover:bg-white hover:text-black'
        }`}
      >
        Select_Plan
      </button>
    </div>
  </ScrollFade>
);

const TypingText = ({
  text,
  onComplete,
}: {
  text: string;
  onComplete?: () => void;
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    let index = 0;
    const typingInterval = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typingInterval);
        onComplete?.();
      }
    }, 150);
    return () => clearInterval(typingInterval);
  }, [text, onComplete]);

  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 530);
    return () => clearInterval(cursorInterval);
  }, []);

  return (
    <span className="font-mono">
      {displayedText}
      <span
        className={`${cursorVisible ? 'opacity-100' : 'opacity-0'} transition-opacity`}
      >
        |
      </span>
    </span>
  );
};

export const Intro: React.FC<IntroProps> = ({ onComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    container: containerRef,
    offset: ['start start', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 50,
    damping: 20,
  });

  const laptopScale = useTransform(smoothProgress, [0, 0.3], [1, 1.5]);
  const laptopOpacity = useTransform(smoothProgress, [0.25, 0.35], [1, 0]);
  const contentOpacity = useTransform(smoothProgress, [0.3, 0.4], [0, 1]);

  return (
    <div
      className="absolute inset-0 z-[100] bg-black text-white overflow-y-auto scroll-smooth font-mono selection:bg-white selection:text-black"
      ref={containerRef}
    >
      <div className="fixed inset-0 pointer-events-none z-0 opacity-10 mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <div className="fixed inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="w-8 h-8 bg-white text-black flex items-center justify-center rounded-none hover:rotate-90 transition-transform duration-500">
            <Brain className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg tracking-tighter">MIRROR.MIND</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-xs font-bold text-gray-400">
          <a href="#features" className="hover:text-white transition-colors uppercase tracking-widest">
            [ FEATURES ]
          </a>
          <a href="#how-it-works" className="hover:text-white transition-colors uppercase tracking-widest">
            [ PROTOCOL ]
          </a>
          <a href="#pricing" className="hover:text-white transition-colors uppercase tracking-widest">
            [ ACCESS ]
          </a>
        </div>
        <button
          onClick={onComplete}
          className="px-6 py-2 text-xs font-bold bg-white/10 backdrop-blur-md text-white hover:bg-white hover:text-black transition-all border border-white/50 hover:border-white uppercase tracking-wider"
        >
          Initialize_Session
        </button>
      </nav>

      {/* Laptop hero */}
      <div className="h-[200vh] relative z-10">
        <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center bg-black">
          <motion.div
            style={{ scale: laptopScale, opacity: laptopOpacity }}
            className="relative"
          >
            <div className="relative">
              <div className="w-[600px] md:w-[800px] h-[375px] md:h-[500px] bg-gradient-to-b from-gray-900 to-black rounded-t-lg border-[8px] border-gray-800 relative overflow-hidden shadow-2xl shadow-white/5">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                <div className="absolute inset-4 bg-black rounded border border-white/10 flex flex-col">
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/80 border-b border-white/10">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    <span className="ml-4 text-xs text-gray-500 font-mono">mirror_mind.exe</span>
                  </div>
                  <div className="flex-1 p-6 flex flex-col justify-center items-center">
                    <div className="text-4xl md:text-6xl font-bold text-white tracking-tighter">
                      <TypingText text="Mirror Mind" />
                    </div>
                    <p className="mt-4 text-gray-500 text-sm">Reflect. Think. Create.</p>
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none" />
              </div>
              <div className="w-[650px] md:w-[850px] h-4 bg-gradient-to-b from-gray-700 to-gray-800 rounded-b-lg mx-auto relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-gray-600 rounded-b" />
              </div>
              <div className="w-[700px] md:w-[900px] h-2 bg-gradient-to-b from-gray-800 to-gray-900 rounded-b-xl mx-auto" />
            </div>
          </motion.div>

          <motion.div
            style={{ opacity: laptopOpacity }}
            className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          >
            <span className="text-xs text-gray-500 uppercase tracking-widest">Scroll to explore</span>
            <ChevronDown className="w-5 h-5 text-gray-500 animate-bounce" />
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <motion.div style={{ opacity: contentOpacity }} className="relative z-10 bg-black border-t border-white/10">
        <section id="features" className="py-32 px-6 max-w-7xl mx-auto relative">
          <ScrollFade>
            <div className="text-center mb-24">
              <h2 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 uppercase leading-none">
                Structure form<br />
                <span className="text-gray-500">From Chaos</span>
              </h2>
              <div className="h-px w-24 bg-white mx-auto mb-8" />
              <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
                Your inner monologue is messy. MirrorMind is the filter.
              </p>
            </div>
          </ScrollFade>
          <div className="grid md:grid-cols-3 gap-8">
            <GlassCard
              icon={Fingerprint}
              title="Zero-Knowledge"
              desc="Local processing pipeline. Thoughts are encrypted in transit and ephemeral by design."
              delay={0}
            />
            <GlassCard
              icon={Terminal}
              title="Socratic Engine"
              desc="It doesn't just listen. It interrogates. Gaps in logic trigger clarification prompts."
              delay={0.2}
            />
            <GlassCard
              icon={Share2}
              title="Knowledge Graph"
              desc="Export JSON trees directly to Obsidian/Notion. Turn whispers into documentation."
              delay={0.4}
            />
          </div>
        </section>

        <section id="how-it-works" className="py-32 bg-[#050505] border-y border-white/10 overflow-hidden">
          <div className="max-w-7xl mx-auto px-6">
            <ScrollFade>
              <div className="flex items-center gap-4 mb-16">
                <div className="w-4 h-4 bg-white" />
                <h3 className="text-2xl font-bold uppercase tracking-widest">Processing_Protocol</h3>
              </div>
            </ScrollFade>
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-4">
                <ProtocolStep number="001" title="Signal Ingestion" desc="User subvocalizes raw thought fragments. Audio is buffered and cleaned." delay={0} />
                <ProtocolStep number="002" title="Semantic Parsing" desc="LLM identifies entities and relationships. 'Landing Page' links to 'Dark Mode'." delay={0.2} />
                <ProtocolStep number="003" title="Graph Projection" desc="Nodes connect in 3D space. Visual feedback loop confirms understanding." delay={0.4} />
              </div>
              <ScrollFade delay={0.3}>
                <div className="aspect-square md:aspect-video rounded-none border border-white/20 bg-black relative p-2 group">
                  <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
                  <div className="h-full w-full border border-white/10 bg-white/5 backdrop-blur-md flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-32 h-32 border border-white/40 rounded-full animate-ping absolute" />
                      <div className="w-48 h-48 border border-white/20 rounded-full animate-ping delay-75 absolute" />
                      <div className="z-10 bg-black border border-white p-4 font-mono text-xs shadow-[4px_4px_0_white]">
                        Processing...
                      </div>
                    </div>
                  </div>
                  <div className="absolute top-0 left-0 w-4 h-4 border-l border-t border-white" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-r border-t border-white" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-l border-b border-white" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-r border-b border-white" />
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        <section id="pricing" className="py-32 px-6 max-w-7xl mx-auto">
          <ScrollFade>
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-bold mb-4 uppercase">System Bandwidth</h2>
              <p className="text-gray-500 text-sm uppercase tracking-widest">Select Processing Power</p>
            </div>
          </ScrollFade>
          <div className="grid md:grid-cols-3 gap-8">
            <PricingCard title="Observer" price="$0" features={['5 Sessions / mo', 'ReadOnly Graph', 'Standard Encryption']} delay={0} />
            <PricingCard title="Operator" price="$29" highlight features={['Unlimited Sessions', 'Full Write Access', 'Notion Sync', 'Priority Node Processing']} delay={0.2} />
            <PricingCard title="Architect" price="Custom" features={['API Access', 'Private Model Hosting', 'SSO Integration', 'On-Premise Deployment']} delay={0.4} />
          </div>
        </section>

        <section className="py-32 text-center relative bg-white text-black border-t border-white/20 overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
          <div className="max-w-4xl mx-auto px-6 relative z-10">
            <ScrollFade>
              <h2 className="text-6xl md:text-9xl font-bold tracking-tighter mb-10 leading-none uppercase">
                Unfold<br />
                <span className="opacity-40">Your Mind</span>
              </h2>
            </ScrollFade>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onComplete}
              className="group relative px-12 py-6 bg-black text-white text-lg font-bold hover:bg-gray-900 transition-all shadow-[8px_8px_0px_rgba(0,0,0,0.2)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]"
            >
              <span className="relative z-10 flex items-center gap-2">
                [ INITIATE_SEQUENCE ] <Zap className="w-4 h-4" />
              </span>
            </motion.button>
          </div>
        </section>

        <footer className="py-12 bg-black text-center text-gray-600 text-xs border-t border-white/10">
          <div className="flex justify-center gap-8 mb-8">
            <Layout className="w-5 h-5 hover:text-white transition-colors cursor-pointer" />
            <Share2 className="w-5 h-5 hover:text-white transition-colors cursor-pointer" />
            <Code2 className="w-5 h-5 hover:text-white transition-colors cursor-pointer" />
          </div>
          <p className="font-mono tracking-widest uppercase opacity-50">
            MirrorMind Systems &copy; 2024 // ALL RIGHTS RESERVED
          </p>
        </footer>
      </motion.div>
    </div>
  );
};
