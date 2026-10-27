import { useAiLens } from './hooks/useAiLens';
import { AppDialogs } from './components/ailens/Dialogs';
import { Shell } from './components/ailens/Shell';
import { Step1 } from './components/ailens/Step1';
import { Step2 } from './components/ailens/Step2';
import { Step3 } from './components/ailens/Step3';
import { Step4 } from './components/ailens/Step4';
import { Step5 } from './components/ailens/Step5';
import { Step6 } from './components/ailens/Step6';

export default function App() {
  const app = useAiLens();
  return <>
    <Shell app={app}>
      {app.activeStep === 1 && <Step1 app={app} />}
      {app.activeStep === 2 && <Step2 app={app} />}
      {app.activeStep === 3 && <Step3 app={app} />}
      {app.activeStep === 4 && <Step4 app={app} />}
      {app.activeStep === 5 && <Step5 app={app} />}
      {app.activeStep === 6 && <Step6 app={app} />}
    </Shell>
    <AppDialogs app={app} />
  </>;
}
