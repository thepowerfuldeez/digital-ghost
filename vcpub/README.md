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

## Webhook

    curl --request POST \
        --url https://api.vc.ru/v1.8/webhooks/add \
        --header 'X-Device-Token: XXXXXXXXXXXXXX' \
        --form 'url=http://requestbin.fullcontact.com/1d9hrbq1?token=anystring' \
        --form 'event=new_comment'

## Mongo reset pubs

    db.final_posts.updateMany({}, { $set:{state:'not_published'}, $unset:{vcPubError:''} });
    db.final_comments.updateMany({}, { $set:{state:'not_published'}, $unset:{vcPubError:''} });
