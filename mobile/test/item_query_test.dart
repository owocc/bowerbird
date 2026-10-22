import 'package:flutter_test/flutter_test.dart';
import 'package:bowerbird_mobile/services/item_query.dart';

void main() {
  test('empty query means browse all', () {
    expect(const ItemQuery().toQueryString(), '');
  });

  test('maps every filter to the query grammar', () {
    const query = ItemQuery(
      text: 'sunset',
      type: 'image',
      orientation: 'landscape',
      tag: 'nature',
      folder: 'f1',
      color: '#EF4444',
      size: 'large',
      rating: 5,
      hasUrl: 'has',
      hasNote: 'empty',
    );
    expect(
      query.toQueryString(),
      'sunset type:image orientation:landscape tag:nature folder:f1 '
      'color:#EF4444 size:large rating:5 has:url no:note',
    );
  });

  test('quotes free text so it cannot become a filter', () {
    const query = ItemQuery(text: 'tag:red two words');
    expect(query.toQueryString(), '"tag:red two words"');
  });

  test('quotes filter values containing spaces and escapes quotes', () {
    const query = ItemQuery(tag: 'client work', text: 'say "hi"');
    expect(query.toQueryString(), r'"say \"hi\"" tag:"client work"');
  });

  test('presence toggles only emit active states', () {
    expect(const ItemQuery(hasUrl: '', hasNote: '').toQueryString(), '');
    expect(const ItemQuery(hasUrl: 'empty', hasNote: 'has').toQueryString(), 'no:url has:note');
  });
}
