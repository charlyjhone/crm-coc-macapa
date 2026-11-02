// Política de privacidade pública (sem login), exigida pela Meta para o app de mensagens.
// Os dados de contato vêm do modo do build: cada escola mostra só os seus.
const SCHOOLS: Record<string, { name: string; contact: string; address: string }> = {
  padrao: {
    name: "COC Macapá Norte",
    contact: "WhatsApp da secretaria (96) 99115-2808 ou presencialmente na secretaria da escola",
    address: "BR-156, Zona Norte, Macapá – AP (próximo ao 2º Batalhão da Polícia Militar)",
  },
  conceito: {
    name: "Colégio Conceito",
    contact: "secretaria do colégio, pelo WhatsApp oficial ou presencialmente",
    address: "Macapá – AP",
  },
};

const UPDATED = "1º de novembro de 2026";

export default function Privacidade() {
  const school = SCHOOLS[import.meta.env.MODE] || SCHOOLS.padrao;
  const h2 = "mt-8 text-lg font-semibold text-[#1B2430]";
  return (
    <main className="min-h-screen bg-[#F4F6F8] px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-2xl bg-white p-6 text-[15px] leading-relaxed text-[#344054] shadow-sm md:p-10">
        <h1 className="text-2xl font-bold text-[#1B2430]">Política de Privacidade</h1>
        <p className="mt-1 text-sm text-[#5B6675]">{school.name} · atualizada em {UPDATED}</p>

        <p className="mt-6">
          Esta política explica como o {school.name} trata os dados pessoais de quem entra em contato com a escola pelo
          WhatsApp, Instagram Direct, Facebook Messenger ou e-mail. Seguimos a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 – LGPD).
        </p>

        <h2 className={h2}>1. Quem é o responsável pelos dados</h2>
        <p>O controlador dos dados é o {school.name}, {school.address}. Contato: {school.contact}.</p>

        <h2 className={h2}>2. Quais dados coletamos</h2>
        <ul className="ml-5 list-disc">
          <li>Nome e, quando informado, o nome de usuário e a foto pública do perfil no Instagram ou Facebook;</li>
          <li>Telefone ou identificador da conta usada para conversar com a escola;</li>
          <li>O conteúdo das mensagens, áudios, imagens e documentos enviados;</li>
          <li>Dados informados para matrícula: nome do responsável, nome e idade do aluno, série e turno de interesse;</li>
          <li>Agendamentos de visita, como a família conheceu a escola e a avaliação do atendimento.</li>
        </ul>

        <h2 className={h2}>3. Para que usamos</h2>
        <ul className="ml-5 list-disc">
          <li>Responder às dúvidas e prestar atendimento às famílias;</li>
          <li>Agendar visitas e acompanhar o interesse em matrícula;</li>
          <li>Melhorar o atendimento e entender quais canais trazem as famílias até a escola.</li>
        </ul>
        <p className="mt-2">
          A base legal é o atendimento a pedidos do próprio titular e os procedimentos preliminares de matrícula (art. 7º, V, da LGPD),
          além do legítimo interesse da escola em organizar seu atendimento (art. 7º, IX). Não vendemos dados nem os usamos para publicidade de terceiros.
        </p>

        <h2 className={h2}>4. Atendente virtual</h2>
        <p>
          Parte das respostas no WhatsApp pode ser feita por uma atendente virtual com inteligência artificial, que repassa a conversa
          para a equipe da secretaria sempre que necessário.
        </p>

        <h2 className={h2}>5. Com quem compartilhamos</h2>
        <p>
          Os dados ficam no sistema de atendimento da escola e só a equipe autorizada (secretaria e direção) tem acesso. Usamos serviços
          de terceiros apenas para operar esse sistema: hospedagem e banco de dados, envio e recebimento de mensagens (WhatsApp, Meta/Instagram/Facebook)
          e o serviço de inteligência artificial da atendente virtual. Esses serviços tratam os dados somente para essa finalidade.
        </p>

        <h2 className={h2}>6. Por quanto tempo guardamos</h2>
        <p>
          Mantemos as conversas e os dados de interesse em matrícula enquanto forem úteis ao atendimento e por até 2 anos após o último contato,
          salvo obrigação legal de guarda por mais tempo. Depois disso, os dados são excluídos ou anonimizados.
        </p>

        <h2 className={h2}>7. Seus direitos e exclusão de dados</h2>
        <p>
          Você pode pedir a qualquer momento a confirmação, o acesso, a correção ou a exclusão dos seus dados, além de informações sobre o
          compartilhamento. Para pedir, fale com a escola pelo {school.contact}. Respondemos em até 15 dias.
          Pedidos de exclusão de quem conversou pelo Instagram ou Facebook também podem ser feitos por esses canais.
        </p>

        <h2 className={h2}>8. Segurança</h2>
        <p>
          O acesso ao sistema é feito com login individual, os dados trafegam com criptografia e cada ação da equipe fica registrada.
        </p>

        <h2 className={h2}>9. Alterações</h2>
        <p>Esta política pode ser atualizada. A data da última versão aparece no topo desta página.</p>
      </article>
    </main>
  );
}
