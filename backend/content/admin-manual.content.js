const manualSections = [
  {
    id: "boas-vindas",
    title: "Boas-vindas ao Painel ADM",
    category: "Início",
    profiles: ["ADM", "Master"],
    summary: "Entenda a finalidade do painel e as responsabilidades de quem opera dados do Centro da Juventude.",
    steps: [
      "Use o painel somente para atividades oficiais do Centro da Juventude.",
      "Gerencie alunos, inscrições, oficinas, frequência, suporte e conteúdo conforme sua permissão.",
      "Use sempre o seu próprio acesso e saia da conta ao terminar.",
      "Lembre que ações importantes podem ser registradas para segurança e auditoria."
    ],
    notices: [
      {
        tone: "attention",
        label: "Atenção",
        text: "Dados de alunos devem ser tratados com cuidado. Não compartilhe login, capturas de tela ou listas com pessoas não autorizadas."
      }
    ],
    shortcuts: [{ label: "Ir para Dashboard", page: "dashboard" }]
  },
  {
    id: "perfis",
    title: "Perfis de acesso",
    category: "Segurança",
    profiles: ["ADM", "Master", "Chamadas"],
    summary: "Cada perfil deve enxergar somente o necessário para sua função.",
    blocks: [
      {
        title: "ADM",
        items: [
          "Gerencia alunos, inscrições, oficinas, turmas, suporte, conteúdo e operações gerais.",
          "Pode acessar Primeiro Acesso para orientar alunos e gerar PDF filtrado de matrícula."
        ]
      },
      {
        title: "Master",
        items: [
          "Possui permissões administrativas avançadas, incluindo usuários ADM e logs.",
          "Pode revogar sessões quando houver troca de função, afastamento ou suspeita de acesso indevido."
        ]
      },
      {
        title: "Chamadas",
        items: [
          "É destinado ao registro de presença e falta.",
          "Não deve acessar matrículas, logs, suporte sensível ou cadastros completos sem autorização definida."
        ]
      }
    ],
    notices: [
      { tone: "practice", label: "Boa prática", text: "Use o menor acesso necessário para realizar a tarefa." }
    ]
  },
  {
    id: "lgpd",
    title: "Segurança e proteção de dados",
    category: "Segurança",
    profiles: ["ADM", "Master", "Chamadas"],
    summary: "Regras simples para proteger alunos, responsáveis e a equipe.",
    steps: [
      "Trate CPF, matrícula, telefone, documentos, observações e dados de responsáveis como informações privadas.",
      "Confira se o destinatário é o aluno ou responsável correto antes de enviar uma orientação.",
      "Não salve planilhas ou PDFs de alunos em computadores públicos.",
      "Não deixe o painel aberto em equipamento compartilhado.",
      "Ao perceber envio incorreto ou uso suspeito, comunique a coordenação."
    ],
    notices: [
      {
        tone: "danger",
        label: "Nunca faça",
        text: "Nunca envie listas de alunos ou matrículas em grupos públicos e nunca utilize dados do sistema para finalidade pessoal."
      }
    ]
  },
  {
    id: "dashboard-graficos",
    title: "Dashboard e Gráficos",
    category: "Visão geral",
    profiles: ["ADM", "Master"],
    summary: "Use os indicadores para acompanhar a operação sem alterar cadastros.",
    steps: [
      "Abra o Dashboard para consultar pendências e visão geral do atendimento.",
      "Acesse Gráficos para comparar inscrições, presenças e faltas por oficina.",
      "Use filtros da área detalhada quando precisar analisar período ou ordenação.",
      "Atualize a tela para verificar os dados mais recentes antes de tomar decisões."
    ],
    notices: [
      { tone: "practice", label: "Boa prática", text: "Indicadores dependem de cadastros e chamadas atualizados. Use-os para análise, não para corrigir registros." }
    ],
    shortcuts: [
      { label: "Ir para Dashboard", page: "dashboard" },
      { label: "Ir para Gráficos", page: "graficos" }
    ]
  },
  {
    id: "alunos",
    title: "Alunos",
    category: "Operação",
    profiles: ["ADM", "Master"],
    summary: "Cadastre, consulte e atualize informações essenciais do aluno com conferência cuidadosa.",
    steps: [
      "Use a busca para verificar se o aluno já existe antes de criar novo cadastro.",
      "Clique em Novo aluno, preencha os dados obrigatórios e selecione oficinas e turmas corretas.",
      "Ao editar telefone, oficina ou turma, confirme a informação antes de salvar.",
      "Consulte documentos e observações somente quando forem necessários para o atendimento.",
      "Considere que alterações importantes podem afetar o acesso ao Portal e as chamadas."
    ],
    notices: [
      {
        tone: "attention",
        label: "Aluno sem CPF",
        text: "O Portal do Aluno utiliza CPF e matrícula para identificação segura. Sem CPF cadastrado, inscrições, suporte e atualizações devem ser tratados presencialmente pela equipe."
      },
      {
        tone: "practice",
        label: "Boa prática",
        text: "Use o CPF completo apenas quando indispensável para conferência; nas demais situações, prefira os dados mascarados."
      }
    ],
    shortcuts: [{ label: "Ir para Alunos", page: "alunos" }]
  },
  {
    id: "inscricoes",
    title: "Inscrições",
    category: "Operação",
    profiles: ["ADM", "Master"],
    summary: "Acompanhe pedidos recebidos e confira documentos sem retirar informações do ambiente autorizado.",
    steps: [
      "Abra Inscritos e localize a solicitação por busca ou oficina.",
      "Confira dados informados e documentos apenas quando necessário.",
      "Corrija informações divergentes somente após confirmação adequada.",
      "Oriente o aluno quando faltarem documentos ou houver pendências.",
      "Atualize o cadastro correspondente com atenção para não duplicar pessoas."
    ],
    notices: [
      { tone: "danger", label: "Atenção", text: "Não compartilhe documentos fora do sistema nem baixe arquivos sem necessidade operacional." }
    ],
    shortcuts: [{ label: "Ir para Inscritos", page: "inscritos" }]
  },
  {
    id: "oficinas-turmas",
    title: "Oficinas e Turmas",
    category: "Operação",
    profiles: ["ADM", "Master"],
    summary: "Mantenha atividades e vínculos consistentes para que matrículas e chamadas funcionem corretamente.",
    steps: [
      "Cadastre ou edite oficina com nome, categoria, horário, capacidade e status corretos.",
      "Organize turmas de forma clara e vincule alunos somente à turma confirmada.",
      "Inative uma oficina quando ela não deve receber novos atendimentos, conforme orientação interna.",
      "Revise os vínculos antes de registrar frequência."
    ],
    notices: [
      { tone: "attention", label: "Antes de alterar", text: "Verifique se há alunos vinculados e registros de chamada antes de inativar ou modificar oficina ou turma." }
    ],
    shortcuts: [
      { label: "Ir para Oficinas", page: "oficinas" },
      { label: "Ir para Turmas", page: "turmas" }
    ]
  },
  {
    id: "turmas-vagas",
    title: "Turmas, vagas e inscricao publica",
    category: "Operacao",
    profiles: ["ADM", "Master"],
    summary: "Use a aba Turmas para controlar dias, horario, faixa etaria, bolsista e vagas de cada turma da oficina.",
    steps: [
      "Clique em Adicionar turma.",
      "Selecione a oficina relacionada.",
      "Informe nome, dias da semana, periodo, horario de inicio e termino.",
      "Informe idade minima, idade maxima e vagas totais.",
      "Vincule um bolsista responsavel quando houver.",
      "Salve e confira a ocupacao na lista de turmas."
    ],
    blocks: [
      {
        title: "Como aparece para o aluno",
        items: [
          "No site publico o aluno escolhe primeiro a oficina.",
          "Depois escolhe uma turma ativa daquela oficina.",
          "Turmas inativas nao aparecem para inscricao.",
          "Se a turma estiver lotada, a inscricao entra como lista de espera."
        ]
      },
      {
        title: "Vagas",
        items: [
          "A vaga da oficina e calculada pela soma das turmas ativas.",
          "O campo antigo de vagas da oficina fica apenas como compatibilidade.",
          "Ao salvar inscricao, o backend recalcula ocupacao e valida idade e turma."
        ]
      }
    ],
    notices: [
      { tone: "attention", label: "Antes de alterar", text: "Nao exclua turma com alunos, inscricoes ou chamadas vinculadas. Inative quando houver historico operacional." }
    ],
    shortcuts: [{ label: "Ir para Turmas", page: "turmas" }]
  },
  {
    id: "primeiro-acesso",
    title: "Primeiro Acesso",
    category: "Comunicação",
    profiles: ["ADM", "Master"],
    summary: "Oriente o aluno a entrar no Portal usando CPF e matrícula, com contato manual e individual.",
    steps: [
      "Abra Primeiro Acesso e filtre por oficina ou turma para reduzir a lista ao atendimento necessário.",
      "Use o filtro de acesso para identificar alunos com ou sem acesso registrado e o filtro de orientação para ver quem já recebeu instrução.",
      "Confira nome, matrícula, CPF mascarado e telefone mascarado antes de orientar.",
      "Clique em Copiar mensagem para obter a orientação pronta e envie manualmente ao aluno ou responsável correto.",
      "Clique em Abrir WhatsApp somente para iniciar uma conversa individual; a mensagem não é enviada automaticamente.",
      "Marque como enviada apenas depois que a orientação realmente foi entregue; use Desmarcar se houver engano.",
      "Use Histórico para consultar registros mínimos de orientação, sem dados sensíveis completos."
    ],
    blocks: [
      {
        title: "Como o Portal funciona atualmente",
        items: [
          "O aluno acessa o Portal e informa CPF e matrícula.",
          "O acesso é liberado apenas ao próprio portal do aluno.",
          "Atualmente não existe login por senha do aluno. Não oriente CPF + senha até essa função existir."
        ]
      },
      {
        title: "Gerar PDF",
        items: [
          "Gere PDF somente com filtro de turma ou oficina, para entrega presencial controlada.",
          "Entregue cada orientação ao aluno ou responsável correto.",
          "Não compartilhe PDF com matrículas em grupos ou locais públicos."
        ]
      }
    ],
    notices: [
      {
        tone: "danger",
        label: "Informação restrita",
        text: "PDFs de Primeiro Acesso contêm matrículas. Guarde, entregue e descarte esses arquivos conforme orientação da coordenação."
      },
      {
        tone: "attention",
        label: "Sem acesso registrado",
        text: "Esse status indica que o sistema não registrou acesso após a implantação da funcionalidade. Acessos anteriores não são reconstruídos."
      }
    ],
    shortcuts: [{ label: "Ir para Primeiro Acesso", page: "primeiro-acesso" }]
  },
  {
    id: "chamadas",
    title: "Chamadas e Frequência",
    category: "Operação",
    profiles: ["ADM", "Master", "Chamadas"],
    summary: "Registre presenças por turma, na data correta, usando somente os dados necessários.",
    steps: [
      "Selecione a turma e confira a data da aula antes de carregar a lista.",
      "Marque cada aluno como presente, falta ou justificado conforme o registro correto.",
      "Revise ausências e justificativas antes de salvar a chamada.",
      "Não use a chamada para alterar cadastro ou mover aluno de turma."
    ],
    notices: [
      {
        tone: "practice",
        label: "Perfil Chamadas",
        text: "O perfil Chamadas deve operar somente frequência e recebe apenas as informações necessárias para essa atividade."
      }
    ],
    shortcuts: [{ label: "Ir para Chamada", page: "chamada" }]
  },
  {
    id: "suporte",
    title: "Suporte e Portal do Aluno",
    category: "Comunicação",
    profiles: ["ADM", "Master"],
    summary: "Responda chamados com linguagem institucional e proteja os anexos enviados.",
    steps: [
      "Abra Suporte para consultar tickets registrados no Portal do Aluno.",
      "Leia a categoria, a descrição e eventuais anexos necessários ao atendimento.",
      "Responda com texto claro e respeitoso, atualizando o atendimento conforme a solução.",
      "Quando a solicitação estiver incompleta, peça somente os dados necessários pelo canal adequado."
    ],
    notices: [
      { tone: "danger", label: "Anexos", text: "Não compartilhe anexos ou mensagens sensíveis fora do sistema ou em grupos de comunicação." }
    ],
    shortcuts: [{ label: "Ir para Suporte", page: "suporte" }]
  },
  {
    id: "mural",
    title: "Mural e Avisos",
    category: "Comunicação",
    profiles: ["ADM", "Master"],
    summary: "Publique comunicados úteis para turmas ou para a comunidade sem expor informações pessoais.",
    steps: [
      "Escolha o destino correto do aviso: mural geral, turma ou notificação individual, quando disponível.",
      "Preencha título, mensagem, tipo e prioridade de forma objetiva.",
      "Edite ou remova avisos desatualizados quando necessário.",
      "Revise o conteúdo antes de publicar."
    ],
    notices: [
      { tone: "danger", label: "Não publique", text: "Não publique CPF, telefone, documentos, matrícula ou exposição individual de aluno em avisos." }
    ],
    shortcuts: [{ label: "Ir para Mural", page: "mural" }]
  },
  {
    id: "galeria",
    title: "Galeria",
    category: "Conteúdo",
    profiles: ["ADM", "Master"],
    summary: "Atualize imagens públicas apenas após conferir conteúdo e autorização de uso.",
    steps: [
      "Cadastre imagem com título e texto alternativo que descrevam corretamente o conteúdo.",
      "Confira a visualização antes de manter a publicação.",
      "Remova ou desative itens inadequados, antigos ou publicados por engano."
    ],
    notices: [
      { tone: "attention", label: "Imagem pública", text: "Verifique autorização de imagem e nunca publique documentos ou dados pessoais como fotografia." }
    ],
    shortcuts: [{ label: "Ir para Galeria", page: "galeria" }]
  },
  {
    id: "depoimentos",
    title: "Depoimentos",
    category: "Conteúdo",
    profiles: ["ADM", "Master"],
    summary: "Mantenha relatos públicos apenas quando forem autorizados e adequados à comunicação institucional.",
    steps: [
      "Cadastre ou edite texto apenas com autorização e revisão da equipe.",
      "Evite atribuir falas a pessoas sem consentimento.",
      "Desative conteúdo que não deva permanecer público."
    ],
    notices: [
      { tone: "practice", label: "Boa prática", text: "Quando não houver relatos autorizados, mantenha a comunicação institucional transparente." }
    ],
    shortcuts: [{ label: "Ir para Depoimentos", page: "depoimentos" }]
  },
  {
    id: "faq",
    title: "FAQ - Perguntas Frequentes",
    category: "Conteúdo",
    profiles: ["ADM", "Master"],
    summary: "Responda dúvidas comuns de forma simples e atualizada.",
    steps: [
      "Crie perguntas com linguagem semelhante à utilizada por alunos e famílias.",
      "Escreva respostas curtas, objetivas e de fácil entendimento.",
      "Edite ou remova orientações que deixarem de valer.",
      "Confira a seção pública após atualizar."
    ],
    notices: [
      { tone: "attention", label: "Conteúdo público", text: "Não inclua dados pessoais nem instruções internas sensíveis em perguntas ou respostas." }
    ],
    shortcuts: [{ label: "Ir para FAQ", page: "faq" }]
  },
  {
    id: "calendario",
    title: "Calendário",
    category: "Operação",
    profiles: ["ADM", "Master"],
    summary: "Organize aulas, eventos e alterações de agenda com informações verificadas.",
    steps: [
      "Cadastre evento com tipo, título, data e horário corretos.",
      "Edite ou remova eventos quando houver alteração confirmada.",
      "Use descrições objetivas para que a equipe entenda a programação."
    ],
    notices: [
      { tone: "attention", label: "Aviso público", text: "Não inclua dados pessoais de alunos em eventos ou comunicados visíveis ao público." }
    ],
    shortcuts: [{ label: "Ir para Calendário", page: "calendario" }]
  },
  {
    id: "colaboradores-bolsistas",
    title: "Colaboradores e Bolsistas",
    category: "Gestão",
    profiles: ["ADM", "Master"],
    summary: "Mantenha vínculos e informações necessárias atualizadas com cuidado.",
    steps: [
      "Use Colaboradores para atualizar informações institucionais exibidas no site.",
      "Use Bolsistas para registrar informações de apoio e vínculos operacionais conforme autorização.",
      "Atualize apenas dados confirmados e necessários à atividade."
    ],
    notices: [
      { tone: "danger", label: "Privacidade", text: "Não torne públicos telefone, CPF, e-mail pessoal ou outros dados privados sem base e autorização adequadas." }
    ],
    shortcuts: [
      { label: "Ir para Colaboradores", page: "colaboradores" },
      { label: "Ir para Bolsistas", page: "bolsistas" }
    ]
  },
  {
    id: "relatorios",
    title: "Exportações e Relatórios",
    category: "Gestão",
    profiles: ["ADM", "Master"],
    summary: "Gere arquivos somente para uma finalidade operacional autorizada.",
    steps: [
      "Use filtros para produzir somente a informação necessária.",
      "Confira o conteúdo antes de compartilhar com pessoa autorizada.",
      "Guarde arquivos apenas no local apropriado e pelo tempo necessário.",
      "Elimine cópias locais quando não forem mais necessárias."
    ],
    notices: [
      { tone: "danger", label: "Atenção", text: "Exportações podem conter dados pessoais. Não envie planilhas ou PDFs de alunos em grupos nem salve em computadores compartilhados." }
    ],
    shortcuts: [{ label: "Ir para Relatórios", page: "relatorios" }]
  },
  {
    id: "usuarios",
    title: "Usuários Administrativos",
    category: "Sistema",
    profiles: ["Master"],
    summary: "O Master administra acessos e deve conceder somente o perfil necessário.",
    steps: [
      "Crie usuário individual para cada pessoa autorizada, sem contas compartilhadas.",
      "Escolha o perfil adequado: ADM, Master ou Chamadas.",
      "Inative a conta quando a pessoa não precisar mais acessar o sistema.",
      "Revogue sessões em caso de troca de função, afastamento ou suspeita de acesso.",
      "Não remova ou rebaixe o último Master ativo."
    ],
    notices: [
      { tone: "attention", label: "Responsabilidade Master", text: "Acesso Master deve ser usado somente para tarefas administrativas avançadas e autorizadas." }
    ],
    shortcuts: [{ label: "Ir para ADMs", page: "usuarios-adm" }]
  },
  {
    id: "logs",
    title: "Logs e Auditoria",
    category: "Sistema",
    profiles: ["Master"],
    summary: "Consulte registros de ações importantes para suporte à auditoria e investigação de problemas.",
    steps: [
      "Use filtros de data, módulo e ação para localizar eventos relevantes.",
      "Consulte logs somente quando houver finalidade administrativa ou investigação legítima.",
      "Ao notar atividade suspeita, comunique a coordenação ou o responsável técnico."
    ],
    notices: [
      { tone: "practice", label: "Proteção", text: "Os logs minimizam ou redigem dados pessoais e não devem ser usados por curiosidade." }
    ],
    shortcuts: [{ label: "Ir para Logs", page: "logs" }]
  },
  {
    id: "casos-comuns",
    title: "Casos comuns de atendimento",
    category: "Ajuda prática",
    profiles: ["ADM", "Master"],
    summary: "Passos rápidos para situações frequentes na secretaria e no atendimento.",
    blocks: [
      {
        title: "Aluno esqueceu a matrícula",
        items: [
          "Abra Primeiro Acesso, filtre por nome, oficina ou turma e confira o aluno.",
          "Copie a mensagem ou abra a conversa individual no WhatsApp.",
          "Envie manualmente ao contato correto e marque a orientação como enviada."
        ]
      },
      {
        title: "Aluno não tem CPF",
        items: [
          "Realize o atendimento presencial e siga a orientação da coordenação para o cadastro.",
          "Informe que o Portal exige CPF e matrícula no fluxo atualmente disponível."
        ]
      },
      {
        title: "Telefone está incorreto ou duvidoso",
        items: [
          "Não envie a matrícula para o número sem confirmação.",
          "Atualize o telefone somente após procedimento interno ou conferência presencial."
        ]
      },
      {
        title: "Aluno não consegue acessar",
        items: [
          "Confira CPF e matrícula cadastrados e oriente a digitação correta.",
          "Se houver muitas tentativas, aguarde o bloqueio temporário ou realize atendimento presencial."
        ]
      },
      {
        title: "Preciso entregar matrículas de uma turma",
        items: [
          "Filtre a turma em Primeiro Acesso, gere o PDF e entregue individualmente.",
          "Não envie o arquivo completo em grupo."
        ]
      }
    ],
    shortcuts: [{ label: "Ir para Primeiro Acesso", page: "primeiro-acesso" }]
  },
  {
    id: "nunca-fazer",
    title: "O que nunca fazer",
    category: "Segurança",
    profiles: ["ADM", "Master", "Chamadas"],
    summary: "Condutas que colocam alunos, equipe e instituição em risco.",
    steps: [
      "Nunca compartilhe usuário ou código de acesso administrativo.",
      "Nunca envie lista de matrículas em grupo de mensagens.",
      "Nunca publique dados de aluno em mural, FAQ, galeria ou calendário.",
      "Nunca deixe o painel aberto em computador público ou compartilhado.",
      "Nunca baixe exportações ou documentos sem necessidade.",
      "Nunca compartilhe PDF de Primeiro Acesso fora da equipe autorizada.",
      "Nunca altere turma ou oficina sem conferir impactos.",
      "Nunca crie usuário administrativo sem autorização.",
      "Nunca use dados do sistema para finalidade pessoal."
    ],
    notices: [
      { tone: "danger", label: "Proteja o atendimento", text: "Em dúvida sobre uma operação com dados, pare e consulte a coordenação antes de prosseguir." }
    ]
  },
  {
    id: "checklist",
    title: "Checklist rápido do dia a dia",
    category: "Ajuda prática",
    profiles: ["ADM", "Master", "Chamadas"],
    summary: "Uma rotina curta para operar o painel com organização e segurança.",
    blocks: [
      {
        title: "Ao iniciar",
        items: [
          "Entre com seu próprio acesso.",
          "Confira que está no painel correto e abra somente os módulos necessários."
        ]
      },
      {
        title: "Ao cadastrar ou editar aluno",
        items: [
          "Confira os dados e evite duplicidade.",
          "Atualize telefone com cuidado e não exponha CPF desnecessariamente."
        ]
      },
      {
        title: "Ao orientar Primeiro Acesso",
        items: [
          "Filtre turma ou oficina, confira o aluno e envie mensagem individual.",
          "Marque a orientação e cuide de PDFs ou planilhas baixados."
        ]
      },
      {
        title: "Ao finalizar",
        items: [
          "Saia da conta.",
          "Feche e descarte arquivos locais que não forem mais necessários."
        ]
      }
    ]
  }
];

module.exports = {
  title: "Manual do Administrador",
  subtitle: "Guia prático para operar o sistema do Centro da Juventude",
  sections: manualSections
};
