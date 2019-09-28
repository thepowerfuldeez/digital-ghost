# vcpub

## Как работает

- раз в N минут:
- идет в монгу
- берет 1 топовый пост из коллекции final_posts где state='not_published'
- помечает его state='publishing'
- склеивает пакет данных для vcru api
- шлет пост в vcru api
- если ок, помечает как state='published' vcruId='xxx' vcruUrl='xxx' vcruPubDate=new Date

## Edge cases

- если пост не удалось положить - возвращаем ему state='not_published', пишем в лог

## ssh vk

    ssh ubuntu@95.213.38.3

## Webhook

    curl --request POST \
        --url https://api.vc.ru/v1.8/webhooks/add \
        --header 'X-Device-Token: XXXXXXXXXXXXXX' \
        --form 'url=http://requestbin.fullcontact.com/1d9hrbq1?token=anystring' \
        --form 'event=new_comment'

## Mongo reset pubs

    db.trends.updateMany({ state:{$exists:true} }, { $unset:{state:''} });
    db.raw_posts.updateMany({ state:{$exists:true} }, { $unset:{state:''} });
    db.raw_comments.updateMany({ state:{$exists:true} }, { $unset:{state:''} });

## tokens

    7d7b173449e4f3846cc2a8186174cf317823138d757d6ad0bdf5d156a558892a - DG
    d08f011c82c623d6b8ba43cc2d6169dbf14d9a391e08edfcab4fabd39b07ba51 - Iurii
    ddd2dfd2fbea5198fcdba7aa73678ff742ace73fd94f318f84e9d103086c4c75 - Lemix
