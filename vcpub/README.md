# vcpub

## Как работает

- раз в N минут:
- идет в монгу
- берет посты из коллекции final_posts где state='not_published'
- помечает их state='publishing_post'
- шлет пост в vcru api
- если ок, помечает как state='publishing_comments' vcruId='xxx' vcruUrl='xxx' vcruPubDate=new Date
- берет комменты по id этого поста где state='not_published'
- помечает как state='publishing'
- шлет коммент в vcru api
- если ок, помечает как state='published'
- после загрузки всех комментов помечает пост как state='published'

## Edge cases

- если пост не удалось положить - возвращаем ему state='not_published', пишем в лог
- если коммент не удалось положить - помечаем коммент state='pub_error', пишем в лог
