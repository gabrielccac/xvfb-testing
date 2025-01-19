fetch('http://localhost:3000/screenshot', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        url: 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/landing?destino=acompanhamento-compra&compra=15695605900832024'
    })
})
.then(response => response.json())
.then(data => console.log(data));