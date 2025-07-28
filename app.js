
document.getElementById('new').addEventListener("click",()=>{
    let newChat=document.getElementById('new');
    newChat.remove();
    let old=document.getElementById('old');
    old.remove();
    let join=document.getElementById('join');
    let id=document.getElementById('chatId');
    let username=document.getElementById('username');
    username.style.visibility="visible";
    join.style.visibility="visible";
})
document.getElementById('old').addEventListener("click",()=>{
    let newChat=document.getElementById('new');
    let old=document.getElementById('old');
    newChat.remove();
    old.remove();
    let join=document.getElementById('join');
    let id=document.getElementById('chatId');
    let username=document.getElementById('username');
    id.style.visibility="visible";
    username.style.visibility="visible";
    join.style.visibility="visible";
})