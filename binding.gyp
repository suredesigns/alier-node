{
    'variables': {
        'gdbm_root%': '',
    },
    'targets': [
        {
            'target_name': 'gdbm_binding',
            'sources': [
                'csrc/gdbm_wrapper.c',
                'csrc/gdbm_binding.c',
            ],
            'link_settings': {
                'libraries': [
                    '-lgdbm'
                ],
            },
            'conditions': [
                ['gdbm_root != ""', {
                    'include_dirs': [
                        '<(gdbm_root)/include'
                    ],
                    'library_dirs': [
                        '<(gdbm_root)/lib'
                    ],
                }]
            ],
            'configurations': {
                'Debug': {
                    'conditions': [
                        ['OS == "linux" and gdbm_root != ""', {
                            'ldflags': ['-Wl,-rpath,<(gdbm_root)/lib']
                        }]
                    ]
                },
                'Release': {}
            }
        },
    ],
}