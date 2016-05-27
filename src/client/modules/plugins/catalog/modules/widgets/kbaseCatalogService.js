/*global
 define
 */
/*jslint
 browser: true,
 white: true
 */
define([
    'jquery',
    'bluebird',
    'kb/service/client/narrativeMethodStore',
    'kb/service/client/catalog',
    'kb/service/client/serviceWizard',
    './catalog_util',
    'datatables',
    'kb/widget/legacy/authenticatedWidget',
    'bootstrap',
    'datatables_bootstrap',
],
    function ($,  Promise, NarrativeMethodStore, Catalog, ServiceWizard, CatalogUtil) {
        $.KBWidget({
            name: "KBaseCatalogService",
            parent: "kbaseAuthenticatedWidget",  // todo: do we still need th
            options: {
                limit: 20,
                skip: 0
            },

            // clients to the catalog service and the NarrativeMethodStore
            catalog: null,
            nms: null,
            util: null,

            // main panel and elements
            $mainPanel: null,
            $loadingPanel: null,


            dev_versions: null,
            beta_versions: null,
            release_versions: null,

            all_versions: null,

            status_data:null,

            init: function (options) {
                this._super(options);
                
                var self = this;

                // new style we have a runtime object that gives us everything in the options
                self.runtime = options.runtime;
                self.setupClients();
                self.util = new CatalogUtil();

                // initialize and add the main panel
                self.$loadingPanel = self.initLoadingPanel();
                self.$elem.append(self.$loadingPanel);
                var mainPanelElements = self.initMainPanel();
                self.$mainPanel = mainPanelElements[0];
                self.$serviceStatusDiv = mainPanelElements[1];
                self.$serviceListDiv = mainPanelElements[2];

                self.$elem.append(self.$mainPanel);
                self.showLoading();


                // get the module information
                var loadingCalls = [];
                loadingCalls.push(self.getServiceModuleList('dev', self.dev_versions));
                loadingCalls.push(self.getServiceModuleList('beta', self.beta_versions));
                loadingCalls.push(self.getServiceModuleList('release', self.release_versions));
                loadingCalls.push(self.getServiceModuleList(null, self.all_versions));
                loadingCalls.push(self.getServiceStatus());

                // when we have it all, then render the list
                Promise.all(loadingCalls).then(function() {
                    self.processData();
                    self.render();
                    console.log(self.dev_versions)
                    console.log(self.beta_versions)
                    console.log(self.release_versions)
                    console.log(self.all_versions)

                    self.hideLoading();
                });

                return this;
            },


            processData: function() {
                var self = this;

                for(var k=0; k<self.all_versions.length; k++) {
                     self.all_versions[k] = self.processEntry(self.all_versions[k]);
                }

                for(var k=0; k<self.dev_versions.length; k++) {
                     self.dev_versions[k] = self.processEntry(self.dev_versions[k]);
                }
                for(var k=0; k<self.beta_versions.length; k++) {
                     self.beta_versions[k] = self.processEntry(self.beta_versions[k]);
                }
                for(var k=0; k<self.release_versions.length; k++) {
                     self.release_versions[k] = self.processEntry(self.release_versions[k]);
                }


            },

            processEntry: function(entry) {
                var newEntry = {};
                newEntry['actions'] = $('<button>').addClass('btn').append('start');
                newEntry['module_name'] = entry['module_name'];
                newEntry['module_name_link'] = '<a href="#appcatalog/module/'+entry['module_name']+'">'+entry['module_name']+'</a>';
                newEntry['version'] =  entry['version'];
                newEntry['git_commit_hash'] = entry['git_commit_hash'];
                return newEntry;
            },


            render: function() {
                var self = this;

                self.renderServiceStatusList(self.status_data);

                self.renderServiceModuleAvailableList('Latest Released Versions', self.release_versions, true);
                self.renderServiceModuleAvailableList('All Released Versions', self.all_versions);
                self.renderServiceModuleAvailableList('Beta Versions', self.beta_versions);
                self.renderServiceModuleAvailableList('Dev Versions', self.dev_versions);
            },


            renderServiceStatusList: function(data) {
                var self = this;

                console.log('status data',data)
                var sDom = 'iftp';
                if(data.length<100) {
                    sDom = 'ift'
                }

                var $table = $('<table>').addClass('table').css('width','100%');

                var $container = $('<div>').addClass('container')
                        .append($('<div>').addClass('row')
                            .append($('<div>').addClass('col-md-12')
                                .append($table)));

                var tblSettings = {
                    "bFilter": true,
                    "sPaginationType": "full_numbers",
                    "iDisplayLength": 100,
                    "sDom": sDom,
                    "aaSorting": [[ 2, "dsc" ], [1, "asc"]],
                    "columns": [
                        {sTitle: "Module", data: "module_name"},
                        {sTitle: "Version", data: "version"},
                        {sTitle: "Status", data: "status"},
                        {sTitle: "Up?", data: "up"},
                        {sTitle: "Health", data: "health"},
                        {sTitle: "Git Hash", data: "hash"},
                        {sTitle: "url", data: "url"},
                        {
                            sTitle: "Actions", 
                            bSortable: false,
                            mRender: function(data, type, full) {return '';}
                        }
                    ],
                    "data": data,
                    "fnCreatedRow": function( nRow, aData, iDataIndex ) {

                        $('td:eq(0)', nRow).html('<a href="#appcatalog/module/'+aData['module_name']+'">'+aData['module_name']+'</a>');

                        $('td:eq(6)', nRow).html('<div style="width:250px"><a href="'+aData['url']+'">'+aData['url']+'</a></div>');

                        if(aData['health'] === 'healthy') {
                            $('td:eq(4)', nRow).html('<span class="label label-success">healthy</span>');
                        } else {
                            $('td:eq(4)', nRow).html('<span class="label label-danger">'+aData['health']+'</span>');
                        }

                        if(aData['version'] != 'unknown') {
                            if(aData['up']) {
                                var $stopBtn = $("<button>").addClass("btn btn-default").append('stop')
                                    .on('click', function() {
                                        self.stop(aData, this);
                                    });
                                $('td:eq(7)', nRow).html($stopBtn);
                            } else {
                                var $startBtn = $("<button>").addClass("btn btn-default").append('start')
                                    .on('click', function() {
                                        self.start(aData, this);
                                    });
                                $('td:eq(7)', nRow).html($startBtn);
                            }
                        }
                    }
                };
                $table.DataTable(tblSettings);
                $table.find('th').css('cursor','pointer');

                self.$serviceStatusDiv.append('<br>');
                self.$serviceStatusDiv.append($container);

            },


            refreshServiceStatus: function() {
                var self = this;
                self.status_data = [];
                self.$serviceStatusDiv.empty();
                self.getServiceStatus().then(function () {
                    self.renderServiceStatusList(self.status_data)
                });
            },


            renderServiceModuleAvailableList: function(title, data, keepOpen) {
                var self = this;

                var sDom = 'iftp';
                if(data.length<100) {
                    sDom = 'ift'
                }

                var $table = $('<table>').addClass('table').css('width','100%');

                var $container = $('<div>').addClass('container')
                        .append($('<div>').addClass('row')
                            .append($('<div>').addClass('col-md-12')
                                .append($table)));

                var tblSettings = {
                    "bFilter": true,
                    "sPaginationType": "full_numbers",
                    "iDisplayLength": 100,
                    "sDom": sDom,
                    "aaSorting": [[ 2, "dsc" ], [1, "asc"]],
                    "columns": [
                        {sTitle: "Module", data: "module_name_link"},
                        {sTitle: "Version", data: "version"},
                        {sTitle: "Git Hash", data: "git_commit_hash"},
                        {
                            sTitle: "Actions", 
                            bSortable: false,
                            mRender: function(data, type, full) {return '';}
                        }
                    ],
                    "data": data,
                    "fnCreatedRow": function( nRow, aData, iDataIndex ) {
                        var $startBtn = $("<button>").addClass("btn btn-success").append('start')
                            .on('click', function() {
                                self.start(aData, this);
                            });
                       $('td:eq(3)', nRow).html($startBtn);
                    }
                };
                $table.DataTable(tblSettings);
                $table.find('th').css('cursor','pointer');

                var $div = $('<div>').css('margin-top','1em');
                var $content = $('<div>').css('margin','1em').append($container).hide();
                var $toggle = $('<i>').addClass('fa fa-chevron-right').css('margin-left','15px');
                var $btn = $('<div>').css('cursor','pointer')
                            .append($('<h4>').append(title).css('display','inline'))
                            .append($toggle)
                            .on('click', function() {
                                        if($toggle.hasClass('fa-chevron-right')) {
                                            // hidden, so show
                                            $toggle.removeClass('fa-chevron-right');
                                            $toggle.addClass('fa-chevron-down');
                                            $content.slideDown();
                                        } else {
                                            $toggle.removeClass('fa-chevron-down');
                                            $toggle.addClass('fa-chevron-right');
                                            $content.slideUp();
                                        }
                                    });
                if(keepOpen) { $btn.click(); }

                $div.append($btn).append($content);
                self.$serviceListDiv.append($div);
            },

            start: function(data, btn) {
                if(data['hash']) {
                    data['git_commit_hash'] = data['hash']
                }
                $(btn).prop('disabled', true);
                $(btn).text('starting...');

                var self = this;
                console.log('starting: ', data);
                return self.wizard.start({
                        'module_name': data['module_name'],
                        'version': data['git_commit_hash']
                    })
                    .then(function () {
                        $(btn).text('done.');
                        console.log('success.')
                    })
                    .catch(function (err) {
                        $(btn).text('error: check browser console.');
                        console.error('ERROR');
                        console.error(err);
                    });
            },

            stop: function(data, btn) {
                if(data['hash']) {
                    data['git_commit_hash'] = data['hash']
                }
                $(btn).prop('disabled', true);
                $(btn).text('stopping...');
                var self = this;
                console.log('stopping: ', data);
                return self.wizard.stop({
                        'module_name': data['module_name'],
                        'version': data['git_commit_hash']
                    })
                    .then(function () {
                        $(btn).text('done.');
                        console.log('success.')
                    })
                    .catch(function (err) {
                        $(btn).text('error: check browser console.');
                        console.error('ERROR');
                        console.error(err);
                    });
            },


            setupClients: function() {
                this.catalog = new Catalog(
                    this.runtime.getConfig('services.catalog.url'),
                    { token: this.runtime.service('session').getAuthToken() }
                );
                this.nms = new NarrativeMethodStore(
                    this.runtime.getConfig('services.narrative_method_store.url'),
                    { token: this.runtime.service('session').getAuthToken() }
                );
                this.wizard = new ServiceWizard(
                    this.runtime.getConfig('services.service_wizard.url'),
                    { token: this.runtime.service('session').getAuthToken() }
                );
            },

            initMainPanel: function($appListPanel, $moduleListPanel) {
                var self = this;
                var $mainPanel = $('<div>').addClass('container');

                $mainPanel.append($('<div>').addClass('kbcb-back-link')
                        .append($('<a href="#appcatalog">').append('<i class="fa fa-chevron-left"></i> back to the Catalog')));
                
                $mainPanel.append($('<h3>').append('Catalog Service Status:'));


                var $statusRefresh = $('<button>').addClass('btn btn-default')
                                        .append($('<i class="fa fa-refresh" aria-hidden="true">'))
                                        .append('&nbsp;&nbspRefresh');
                $statusRefresh.on('click', function() { self.refreshServiceStatus(); })
                $mainPanel.append($statusRefresh);
                var $serviceStatusDiv = $('<div>');
                $mainPanel.append($serviceStatusDiv);

                $mainPanel.append($('<h3>').append('Catalog Available Service List:'));
                var $serviceListDiv = $('<div>').addClass('row kbcb-ctr-toolbar');
                $mainPanel.append($serviceListDiv);


                $mainPanel.append('<br><br><br><br><br>');

                return [$mainPanel, $serviceStatusDiv, $serviceListDiv];
            },

            initLoadingPanel: function() {
                var $loadingPanel = $('<div>').addClass('kbcb-loading-panel-div');
                $loadingPanel.append($('<i>').addClass('fa fa-spinner fa-2x fa-spin'));
                return $loadingPanel;
            },

            showLoading: function() {
                var self = this;
                self.$loadingPanel.show();
                self.$mainPanel.hide();
            },
            hideLoading: function() {
                var self = this;
                self.$loadingPanel.hide();
                self.$mainPanel.show();
            },


           
            getServiceStatus: function() {
                var self = this;
                return self.wizard.list_service_status({})
                    .then(function (service_status_list) {
                        console.log(service_status_list);
                        self.status_data = service_status_list;
                    })
                    .catch(function (err) {
                        console.error('ERROR');
                        console.error(err);
                    });
            },

            getServiceModuleList: function(tag) {
                var self = this;
                var p = {};
                if(tag) { p = {tag:tag}; }
                return self.catalog.list_service_modules(p)
                    .then(function (module_list) {
                        if(tag==='dev'){
                            self.dev_versions = module_list;
                        } else if(tag==='beta') {
                            self.beta_versions = module_list;
                        } else if (tag ==='release') {
                            self.release_versions = module_list;
                        } else {
                            self.all_versions = module_list;
                        }
                    })
                    .catch(function (err) {
                        console.error('ERROR');
                        console.error(err);
                    });
            },


            showError: function (error) {
                this.$errorPanel.empty();
                this.$errorPanel.append('<strong>Error when fetching App/Method information.</strong><br><br>');
                this.$errorPanel.append(error.error.message);
                this.$errorPanel.append('<br>');
                this.$errorPanel.show();
            }

        });
    });



