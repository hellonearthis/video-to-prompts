# =============================================================================
# TUTORIAL: GRAPHICAL USER INTERFACE LAUNCHER FOR LLAMA-SERVER & ELECTRON APP
# =============================================================================
#
# WHAT THIS SCRIPT ACCOMPLISHES:
# Provides a native Windows Presentation Foundation (WPF) dark-mode graphical
# launcher for the Video to Prompts application. It discovers all GGUF vision
# models and companion multimodal projectors in C:\llamaCPP\models, enables
# real-time filtering, configures hardware acceleration flags (16k context,
# 8-bit quantized KV caching, Flash Attention), handles occupied port cleanup,
# and initiates both the AI inference engine and the Vite/Electron frontend.
#
# WHY THIS IS PREFERRED OVER CONSOLE INTERFACES:
# 1. VISUAL MODEL COMPARISON:
#    Users can inspect model disk size, folder locations, and paired mmproj
#    projectors in a clear, formatted grid without scrolling terminal lines.
# 2. INSTANT SEARCH FILTERING:
#    Typing in the search box filters 15+ models dynamically by name or parameter count.
# 3. ACCIDENTAL TERMINATION PROTECTION:
#    Interactive graphical buttons eliminate typo mistakes when entering port numbers
#    or selecting model indexes.
# =============================================================================

[CmdletBinding()]
param (
    [string]$llama_installation_directory = "C:\llamaCPP",
    [int]$default_server_port_number = 8081,
    [int]$default_context_window_tokens = 16384
)

# WHAT: Import necessary .NET Presentation frameworks for rendering WPF XAML.
# WHY: Allows PowerShell to render hardware-accelerated native Windows controls
# without requiring Python, Electron, or external GUI library dependencies.
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms

# WHAT: Define file paths for the working directory and configuration memory.
# WHY: The launcher stores the user's last picked model in .last_model_choice to
# automatically restore their preference on subsequent launches.
$launcher_script_directory = Split-Path -Parent $MyInvocation.MyCommand.Path
$last_selected_model_choice_file_path = Join-Path $launcher_script_directory ".last_model_choice"
$models_repository_directory = Join-Path $llama_installation_directory "models"
$llama_server_executable_path = Join-Path $llama_installation_directory "llama-server.exe"

# WHAT: Data class representing an individual discoverable vision model package.
# WHY: Encapsulates all metadata required by llama-server.exe to instantiate multimodal vision.
class VisionModelEntry {
    [string]$DisplayName
    [string]$ModelFileName
    [double]$ModelSizeInGigabytes
    [string]$ModelAbsoluteFilePath
    [string]$CompanionProjectorFileName
    [string]$CompanionProjectorAbsoluteFilePath
    [string]$ParentFolderLeafName

    VisionModelEntry(
        [string]$display_name_parameter,
        [string]$model_file_name_parameter,
        [double]$model_size_parameter,
        [string]$model_path_parameter,
        [string]$projector_name_parameter,
        [string]$projector_path_parameter,
        [string]$folder_leaf_parameter
    ) {
        $this.DisplayName = $display_name_parameter
        $this.ModelFileName = $model_file_name_parameter
        $this.ModelSizeInGigabytes = $model_size_parameter
        $this.ModelAbsoluteFilePath = $model_path_parameter
        $this.CompanionProjectorFileName = $projector_name_parameter
        $this.CompanionProjectorAbsoluteFilePath = $projector_path_parameter
        $this.ParentFolderLeafName = $folder_leaf_parameter
    }
}

# WHAT: Scans the models directory, pairing GGUF model files with multimodal projector tensors.
# WHY: Vision models cannot process image frames without an accompanying mmproj file.
function Discover-VisionModelLibrary {
    param (
        [string]$directory_to_scan
    )

    $discovered_models_collection = [System.Collections.Generic.List[VisionModelEntry]]::new()

    if (-not (Test-Path $directory_to_scan)) {
        return $discovered_models_collection
    }

    $all_gguf_files_in_directory = Get-ChildItem -Path $directory_to_scan -Recurse -Filter "*.gguf" -File -ErrorAction SilentlyContinue
    $projector_files_collection = @($all_gguf_files_in_directory | Where-Object { $_.Name -like "mmproj*" })
    $candidate_model_files_collection = @($all_gguf_files_in_directory | Where-Object { 
        $_.Name -notlike "mmproj*" -and 
        $_.Name -notlike "*embed*" -and 
        $_.Name -notlike "*imatrix*"
    })

    foreach ($candidate_model_file in $candidate_model_files_collection) {
        # WHAT: Look for an mmproj file situated in the identical directory.
        # WHY: Projectors downloaded together usually reside in the same folder.
        $matched_projector_file = $projector_files_collection | Where-Object { $_.DirectoryName -eq $candidate_model_file.DirectoryName } | Select-Object -First 1

        # WHAT: If no sibling projector exists, search for family name prefix matches.
        # WHY: Handles shared model directories where projectors share architecture prefixes (e.g. Qwen3-VL).
        if (-not $matched_projector_file) {
            $model_family_prefix_string = ($candidate_model_file.BaseName -split "-")[0]
            $matched_projector_file = $projector_files_collection | Where-Object { $_.Name -like "*$model_family_prefix_string*" } | Select-Object -First 1
        }

        if ($matched_projector_file) {
            $calculated_size_in_gigabytes = [math]::Round($candidate_model_file.Length / 1GB, 1)
            $sanitized_display_name = $candidate_model_file.Name -replace '\.gguf$', ''

            $discovered_entry = [VisionModelEntry]::new(
                $sanitized_display_name,
                $candidate_model_file.Name,
                $calculated_size_in_gigabytes,
                $candidate_model_file.FullName,
                $matched_projector_file.Name,
                $matched_projector_file.FullName,
                (Split-Path $candidate_model_file.DirectoryName -Leaf)
            )
            $discovered_models_collection.Add($discovered_entry)
        }
    }

    return $discovered_models_collection
}

# WHAT: Modern dark-themed WPF XAML interface declaration.
# WHY: Declares responsive layout, visual styling, lists, and input controls declaratively.
$xaml_interface_specification = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Video to Prompts - Local AI &amp; Application Launcher"
        Height="720" Width="860" MinHeight="650" MinWidth="750"
        Background="#18181f" Foreground="#e0e0e0"
        WindowStartupLocation="CenterScreen">
    <Window.Resources>
        <Style TargetType="TextBlock">
            <Setter Property="FontFamily" Value="Segoe UI, Roboto, sans-serif"/>
        </Style>

        <Style TargetType="TextBox">
            <Setter Property="Background" Value="#242634"/>
            <Setter Property="Foreground" Value="#ffffff"/>
            <Setter Property="BorderBrush" Value="#4cc9f0"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="Padding" Value="8,6"/>
            <Setter Property="FontSize" Value="13"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
        </Style>

        <!-- High-Contrast ComboBox ToggleButton Template -->
        <ControlTemplate x:Key="HighContrastComboBoxToggleButton" TargetType="ToggleButton">
            <Border x:Name="TemplateRoot" Background="#242634" BorderBrush="#4cc9f0" BorderThickness="1" CornerRadius="4" SnapsToDevicePixels="true">
                <Border x:Name="SplitBorder" Width="26" HorizontalAlignment="Right" SnapsToDevicePixels="true">
                    <Path x:Name="Arrow" Data="F1 M 0,0 L 2.667,2.667 L 5.333,0 L 0,0 Z" Fill="#4cc9f0" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                </Border>
            </Border>
            <ControlTemplate.Triggers>
                <Trigger Property="IsMouseOver" Value="true">
                    <Setter TargetName="TemplateRoot" Property="Background" Value="#2f3244"/>
                    <Setter TargetName="TemplateRoot" Property="BorderBrush" Value="#82cfff"/>
                    <Setter TargetName="Arrow" Property="Fill" Value="#82cfff"/>
                </Trigger>
            </ControlTemplate.Triggers>
        </ControlTemplate>

        <!-- High-Contrast ComboBox Style -->
        <Style TargetType="ComboBox">
            <Setter Property="Foreground" Value="#ffffff"/>
            <Setter Property="FontSize" Value="13"/>
            <Setter Property="FontWeight" Value="Bold"/>
            <Setter Property="SnapsToDevicePixels" Value="true"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="ComboBox">
                        <Grid x:Name="MainGrid" SnapsToDevicePixels="true">
                            <Popup x:Name="PART_Popup" AllowsTransparency="true" IsOpen="{Binding IsDropDownOpen, Mode=TwoWay, RelativeSource={RelativeSource TemplatedParent}}" Placement="Bottom" Margin="1">
                                <Border x:Name="DropDownBorder" Background="#1e202c" BorderBrush="#4cc9f0" BorderThickness="1" CornerRadius="4" MinWidth="{Binding ActualWidth, ElementName=MainGrid}" MaxHeight="{TemplateBinding MaxDropDownHeight}">
                                    <ScrollViewer x:Name="DropDownScrollViewer">
                                        <Grid RenderOptions.ClearTypeHint="Enabled">
                                            <Canvas Height="0" Width="0" HorizontalAlignment="Left" VerticalAlignment="Top"/>
                                            <ItemsPresenter x:Name="ItemsPresenter" KeyboardNavigation.DirectionalNavigation="Contained" SnapsToDevicePixels="{TemplateBinding SnapsToDevicePixels}"/>
                                        </Grid>
                                    </ScrollViewer>
                                </Border>
                            </Popup>
                            <ToggleButton x:Name="ToggleButton" Template="{StaticResource HighContrastComboBoxToggleButton}" Grid.ColumnSpan="2" IsChecked="{Binding IsDropDownOpen, Mode=TwoWay, RelativeSource={RelativeSource TemplatedParent}}"/>
                            <ContentPresenter ContentTemplate="{TemplateBinding SelectionBoxItemTemplate}" Content="{TemplateBinding SelectionBoxItem}" ContentStringFormat="{TemplateBinding SelectionBoxItemStringFormat}" HorizontalAlignment="Left" Margin="10,6,28,6" IsHitTestVisible="false" SnapsToDevicePixels="{TemplateBinding SnapsToDevicePixels}" VerticalAlignment="Center"/>
                        </Grid>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>

        <!-- High-Contrast ComboBoxItem Style -->
        <Style TargetType="ComboBoxItem">
            <Setter Property="Background" Value="#1e202c"/>
            <Setter Property="Foreground" Value="#ffffff"/>
            <Setter Property="Padding" Value="10,8"/>
            <Setter Property="FontSize" Value="13"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="SnapsToDevicePixels" Value="true"/>
            <Style.Triggers>
                <Trigger Property="IsHighlighted" Value="true">
                    <Setter Property="Background" Value="#0284c7"/>
                    <Setter Property="Foreground" Value="#ffffff"/>
                </Trigger>
                <Trigger Property="IsSelected" Value="true">
                    <Setter Property="Background" Value="#0369a1"/>
                    <Setter Property="Foreground" Value="#ffffff"/>
                </Trigger>
            </Style.Triggers>
        </Style>

        <Style TargetType="CheckBox">
            <Setter Property="Foreground" Value="#d0d0d8"/>
            <Setter Property="FontSize" Value="12"/>
            <Setter Property="Margin" Value="0,4"/>
        </Style>
    </Window.Resources>

    <Grid Margin="20">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/> <!-- Header -->
            <RowDefinition Height="Auto"/> <!-- Search Box -->
            <RowDefinition Height="*"/>    <!-- Model Grid -->
            <RowDefinition Height="Auto"/> <!-- Configuration Panel -->
            <RowDefinition Height="Auto"/> <!-- Action Buttons -->
            <RowDefinition Height="Auto"/> <!-- Status Bar -->
        </Grid.RowDefinitions>

        <!-- Header -->
        <Border Grid.Row="0" Background="#20202c" CornerRadius="8" Padding="16,14" Margin="0,0,0,14" BorderBrush="#2e2e40" BorderThickness="1">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <StackPanel Grid.Column="0">
                    <TextBlock Text="VIDEO TO PROMPTS" FontSize="18" FontWeight="Bold" Foreground="#4cc9f0"/>
                    <TextBlock Text="Universal Local Multimodal Vision &amp; Storyboard Studio Launcher" FontSize="12" Foreground="#8e8ea0" Margin="0,2,0,0"/>
                </StackPanel>
                <Border Grid.Column="1" Background="#143447" CornerRadius="4" Padding="10,4" VerticalAlignment="Center">
                    <TextBlock Text="llama.cpp Engine" FontSize="11" FontWeight="SemiBold" Foreground="#4cc9f0"/>
                </Border>
            </Grid>
        </Border>

        <!-- Search Bar -->
        <Grid Grid.Row="1" Margin="0,0,0,10">
            <Grid.ColumnDefinitions>
                <ColumnDefinition Width="*"/>
                <ColumnDefinition Width="Auto"/>
            </Grid.ColumnDefinitions>
            <TextBox Name="SearchInputTextBox" Grid.Column="0" Text="" Margin="0,0,10,0"/>
            <TextBlock IsHitTestVisible="False" Text="Filter models by name, size, or family..." VerticalAlignment="Center" Margin="12,0,0,0" Foreground="#6a6a7e" FontSize="13" Name="SearchPlaceholderTextBlock"/>
            <Button Name="RefreshButton" Grid.Column="1" Content="Refresh Library" Background="#252532" Foreground="#d0d0dc" BorderBrush="#3a3a4c" Padding="12,6" Cursor="Hand" FontWeight="SemiBold"/>
        </Grid>

        <!-- Model Selection Grid -->
        <Border Grid.Row="2" Background="#1e1e28" BorderBrush="#2d2d3e" BorderThickness="1" CornerRadius="6" Margin="0,0,0,14">
            <ListView Name="ModelSelectionListView" Background="Transparent" BorderThickness="0" Foreground="#ffffff" SelectionMode="Single" ScrollViewer.HorizontalScrollBarVisibility="Disabled">
                <ListView.ItemContainerStyle>
                    <Style TargetType="ListViewItem">
                        <Setter Property="HorizontalContentAlignment" Value="Stretch"/>
                        <Setter Property="Padding" Value="10,8"/>
                        <Setter Property="BorderBrush" Value="#262636"/>
                        <Setter Property="BorderThickness" Value="0,0,0,1"/>
                        <Style.Triggers>
                            <Trigger Property="IsSelected" Value="True">
                                <Setter Property="Background" Value="#223a5e"/>
                                <Setter Property="BorderBrush" Value="#4cc9f0"/>
                            </Trigger>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter Property="Background" Value="#262638"/>
                            </Trigger>
                        </Style.Triggers>
                    </Style>
                </ListView.ItemContainerStyle>
                <ListView.ItemTemplate>
                    <DataTemplate>
                        <Grid>
                            <Grid.ColumnDefinitions>
                                <ColumnDefinition Width="*"/>
                                <ColumnDefinition Width="Auto"/>
                            </Grid.ColumnDefinitions>
                            <StackPanel Grid.Column="0">
                                <TextBlock Text="{Binding DisplayName}" FontWeight="Bold" FontSize="13" Foreground="#ffffff"/>
                                <TextBlock FontSize="11" Foreground="#858598" Margin="0,3,0,0">
                                    <Run Text="Projector: " Foreground="#5f5f70"/>
                                    <Run Text="{Binding CompanionProjectorFileName}" Foreground="#a2a2b8"/>
                                    <Run Text="  |  Folder: " Foreground="#5f5f70"/>
                                    <Run Text="{Binding ParentFolderLeafName}" Foreground="#82cfff"/>
                                </TextBlock>
                            </StackPanel>
                            <Border Grid.Column="1" Background="#28283a" CornerRadius="4" Padding="8,4" VerticalAlignment="Center" Margin="10,0,0,0">
                                <TextBlock Text="{Binding ModelSizeInGigabytes, StringFormat='{}{0} GB'}" FontWeight="Bold" FontSize="12" Foreground="#ffd166"/>
                            </Border>
                        </Grid>
                    </DataTemplate>
                </ListView.ItemTemplate>
            </ListView>
        </Border>

        <!-- Hardware & Settings Configuration Panel -->
        <Border Grid.Row="3" Background="#1e1e28" BorderBrush="#2e2e42" BorderThickness="1" CornerRadius="6" Padding="14,12" Margin="0,0,0,14">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="*"/>
                </Grid.ColumnDefinitions>

                <!-- Left Column: Context Tokens & Port -->
                <StackPanel Grid.Column="0" Margin="0,0,15,0">
                    <TextBlock Text="HARDWARE ENGINE CONFIGURATION" FontSize="11" FontWeight="Bold" Foreground="#82cfff" Margin="0,0,0,8"/>
                    
                    <Grid Margin="0,0,0,8">
                        <Grid.ColumnDefinitions>
                            <ColumnDefinition Width="140"/>
                            <ColumnDefinition Width="*"/>
                        </Grid.ColumnDefinitions>
                        <TextBlock Grid.Column="0" Text="Context Tokens (-c):" VerticalAlignment="Center" Foreground="#ffffff" FontWeight="SemiBold" FontSize="12"/>
                        <ComboBox Name="ContextTokensComboBox" Grid.Column="1" Cursor="Hand">
                            <ComboBoxItem Content="16384 (16k - Recommended)" Tag="16384" IsSelected="True"/>
                            <ComboBoxItem Content="8192 (8k - Fast)" Tag="8192"/>
                            <ComboBoxItem Content="32768 (32k - Extended)" Tag="32768"/>
                            <ComboBoxItem Content="4096 (4k - Low VRAM)" Tag="4096"/>
                        </ComboBox>
                    </Grid>

                    <Grid>
                        <Grid.ColumnDefinitions>
                            <ColumnDefinition Width="140"/>
                            <ColumnDefinition Width="*"/>
                        </Grid.ColumnDefinitions>
                        <TextBlock Grid.Column="0" Text="Server Port:" VerticalAlignment="Center" Foreground="#ffffff" FontWeight="SemiBold" FontSize="12"/>
                        <TextBox Name="ServerPortTextBox" Grid.Column="1" Text="8081"/>
                    </Grid>
                </StackPanel>

                <!-- Right Column: VRAM Optimizations -->
                <StackPanel Grid.Column="1" Margin="15,0,0,0">
                    <TextBlock Text="VRAM &amp; SPEED OPTIMIZATIONS" FontSize="11" FontWeight="Bold" Foreground="#82cfff" Margin="0,0,0,8"/>
                    <CheckBox Name="QuantizedKvCacheCheckBox" Content="8-bit Quantized KV Cache (-ctk q8_0 -ctv q8_0)" IsChecked="True" ToolTip="Halves KV cache memory footprint to ~1.2 GB for 16k context"/>
                    <CheckBox Name="FlashAttentionCheckBox" Content="Flash Attention (--flash-attn on)" IsChecked="True" ToolTip="High performance memory-efficient attention computation"/>
                    <CheckBox Name="GpuOffloadCheckBox" Content="Full GPU Offload (-ngl 99)" IsChecked="True" ToolTip="Offloads all layers to NVIDIA GPU"/>
                </StackPanel>
            </Grid>
        </Border>

        <!-- Action Buttons -->
        <Grid Grid.Row="4" Margin="0,0,0,12">
            <Grid.ColumnDefinitions>
                <ColumnDefinition Width="2*"/>
                <ColumnDefinition Width="1.5*"/>
                <ColumnDefinition Width="*"/>
            </Grid.ColumnDefinitions>

            <Button Name="LaunchFullStackButton" Grid.Column="0" Content="Launch AI Server &amp; App" Background="#059669" Foreground="#ffffff" FontWeight="Bold" FontSize="14" Padding="14,10" Margin="0,0,8,0" Cursor="Hand" BorderThickness="0">
                <Button.Resources>
                    <Style TargetType="Border">
                        <Setter Property="CornerRadius" Value="6"/>
                    </Style>
                </Button.Resources>
            </Button>

            <Button Name="LaunchAppOnlyButton" Grid.Column="1" Content="Launch App Only" Background="#2563eb" Foreground="#ffffff" FontWeight="SemiBold" FontSize="13" Padding="12,10" Margin="4,0,8,0" Cursor="Hand" BorderThickness="0" ToolTip="Starts the desktop application assuming llama-server is already active">
                <Button.Resources>
                    <Style TargetType="Border">
                        <Setter Property="CornerRadius" Value="6"/>
                    </Style>
                </Button.Resources>
            </Button>

            <Button Name="StopServerButton" Grid.Column="2" Content="Stop Server" Background="#dc2626" Foreground="#ffffff" FontWeight="SemiBold" FontSize="13" Padding="12,10" Margin="4,0,0,0" Cursor="Hand" BorderThickness="0" ToolTip="Terminates any process currently occupying the configured port">
                <Button.Resources>
                    <Style TargetType="Border">
                        <Setter Property="CornerRadius" Value="6"/>
                    </Style>
                </Button.Resources>
            </Button>
        </Grid>

        <!-- Status Bar -->
        <Border Grid.Row="5" Background="#14141c" CornerRadius="4" Padding="10,6" BorderBrush="#22222e" BorderThickness="1">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <TextBlock Name="StatusMessageTextBlock" Grid.Column="0" Text="Ready to launch." FontSize="11" Foreground="#a0a0b2" VerticalAlignment="Center"/>
                <ProgressBar Name="ActivityProgressBar" Grid.Column="1" Width="90" Height="8" IsIndeterminate="False" Visibility="Collapsed" Background="#20202e" Foreground="#4cc9f0"/>
            </Grid>
        </Border>
    </Grid>
</Window>
"@

# WHAT: Load XAML string into a WPF Window object using StringReader and XamlReader.
# WHY: Converts the declarative XML layout into an interactive .NET Window.
$string_reader_instance = [System.IO.StringReader]::new($xaml_interface_specification)
$xml_reader_instance = [System.Xml.XmlReader]::Create($string_reader_instance)
$application_main_window = [System.Windows.Markup.XamlReader]::Load($xml_reader_instance)

# WHAT: Locate and bind named visual elements from the instantiated visual tree.
# WHY: Allows PowerShell event handlers to update labels, read inputs, and react to clicks.
$search_input_text_box = $application_main_window.FindName("SearchInputTextBox")
$search_placeholder_text_block = $application_main_window.FindName("SearchPlaceholderTextBlock")
$model_selection_list_view = $application_main_window.FindName("ModelSelectionListView")
$refresh_library_button = $application_main_window.FindName("RefreshButton")
$context_tokens_combo_box = $application_main_window.FindName("ContextTokensComboBox")
$server_port_text_box = $application_main_window.FindName("ServerPortTextBox")
$quantized_kv_cache_check_box = $application_main_window.FindName("QuantizedKvCacheCheckBox")
$flash_attention_check_box = $application_main_window.FindName("FlashAttentionCheckBox")
$gpu_offload_check_box = $application_main_window.FindName("GpuOffloadCheckBox")
$launch_full_stack_button = $application_main_window.FindName("LaunchFullStackButton")
$launch_app_only_button = $application_main_window.FindName("LaunchAppOnlyButton")
$stop_server_button = $application_main_window.FindName("StopServerButton")
$status_message_text_block = $application_main_window.FindName("StatusMessageTextBlock")
$activity_progress_bar = $application_main_window.FindName("ActivityProgressBar")

# Set initial default port
$server_port_text_box.Text = "$default_server_port_number"

# WHAT: Cache of all discovered vision models in memory.
# WHY: Enables instantaneous real-time filtering as the user types in the search bar.
$all_discovered_models_cache = [System.Collections.Generic.List[VisionModelEntry]]::new()

# WHAT: Populates the model ListView and applies search query filtering.
# WHY: Allows users to quickly find specific parameter weights (e.g. "27B" or "VL-8B").
function Refresh-ModelViewList {
    $search_query_filter = $search_input_text_box.Text.Trim()

    if ([string]::IsNullOrWhiteSpace($search_query_filter)) {
        $search_placeholder_text_block.Visibility = [System.Windows.Visibility]::Visible
        $filtered_models_list = $all_discovered_models_cache
    } else {
        $search_placeholder_text_block.Visibility = [System.Windows.Visibility]::Collapsed
        $filtered_models_list = $all_discovered_models_cache | Where-Object {
            $_.DisplayName -like "*$search_query_filter*" -or
            $_.ParentFolderLeafName -like "*$search_query_filter*" -or
            $_.CompanionProjectorFileName -like "*$search_query_filter*"
        }
    }

    $model_selection_list_view.ItemsSource = $filtered_models_list

    # Restore selection to last chosen model if available
    if (Test-Path $last_selected_model_choice_file_path) {
        $saved_model_preference_name = Get-Content $last_selected_model_choice_file_path -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($saved_model_preference_name) {
            foreach ($current_entry in $filtered_models_list) {
                if ($current_entry.DisplayName -eq $saved_model_preference_name.Trim()) {
                    $model_selection_list_view.SelectedItem = $current_entry
                    break
                }
            }
        }
    }

    if ($model_selection_list_view.SelectedIndex -eq -1 -and $filtered_models_list.Count -gt 0) {
        $model_selection_list_view.SelectedIndex = 0
    }
}

# WHAT: Scans C:\llamaCPP\models and refreshes the ListView items.
# WHY: Discovers newly added model checkpoints without restarting the GUI.
function Reload-VisionLibrary {
    $status_message_text_block.Text = "Scanning for vision models in $models_repository_directory..."
    $script:all_discovered_models_cache = Discover-VisionModelLibrary -directory_to_scan $models_repository_directory

    if ($all_discovered_models_cache.Count -eq 0) {
        $status_message_text_block.Text = "No multimodal models found in $models_repository_directory."
    } else {
        $status_message_text_block.Text = "Found $($all_discovered_models_cache.Count) vision model(s) ready in library."
    }

    Refresh-ModelViewList
}

# WHAT: Terminates any process occupying the target port.
# WHY: Frees port 8081 cleanly so the new llama-server instance can bind without conflict.
function Terminate-PortConflicts {
    param ([int]$target_port_number)

    $occupying_tcp_connection = Get-NetTCPConnection -LocalPort $target_port_number -ErrorAction SilentlyContinue
    if ($occupying_tcp_connection) {
        $process_identifiers = $occupying_tcp_connection | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 4 }
        foreach ($process_id in $process_identifiers) {
            $occupying_process = Get-Process -Id $process_id -ErrorAction SilentlyContinue
            if ($occupying_process) {
                $status_message_text_block.Text = "Stopping existing process on port $target_port_number ($($occupying_process.ProcessName))..."
                try {
                    Stop-Process -Id $process_id -Force -ErrorAction SilentlyContinue *>$null
                } catch {}
                Start-Sleep -Milliseconds 800
            }
        }
    }
}

# WHAT: Event handler for real-time text input in the search box.
# WHY: Updates the displayed models list on each keystroke.
$search_input_text_box.Add_TextChanged({
    Refresh-ModelViewList
})

# WHAT: Event handler for the Refresh Library button.
# WHY: Allows user to re-scan the models directory after downloading new weights.
$refresh_library_button.Add_Click({
    Reload-VisionLibrary
})

# WHAT: Event handler for the Stop Server button.
# WHY: Allows manually halting any running llama-server instance without closing the GUI.
$stop_server_button.Add_Click({
    $target_port_number = [int]$server_port_text_box.Text.Trim()
    Terminate-PortConflicts -target_port_number $target_port_number
    $status_message_text_block.Text = "Server on port $target_port_number stopped."
})

# WHAT: Event handler for Launch App Only button (skip AI server startup).
# WHY: Launches Vite/Electron directly when llama-server is already running in background.
$launch_app_only_button.Add_Click({
    $target_port_number = [int]$server_port_text_box.Text.Trim()
    $status_message_text_block.Text = "Launching Video to Prompts application on port $target_port_number..."
    
    $env:LLAMA_SERVER_PORT = "$target_port_number"
    $env:LOCAL_AI_URL = "http://localhost:$target_port_number"

    Set-Location $launcher_script_directory
    Start-Process -FilePath "cmd.exe" -ArgumentList @('/k', 'title Video to Prompts Dev Server & npm run dev')
    
    $status_message_text_block.Text = "Electron app launched! Server URL: http://localhost:$target_port_number"
})

# WHAT: Event handler for the primary "Launch AI Server & App" button.
# WHY: Coordinates pre-flight checks, saves preference, starts llama-server, and launches the app.
$launch_full_stack_button.Add_Click({
    $selected_vision_model_entry = $model_selection_list_view.SelectedItem -as [VisionModelEntry]

    if (-not $selected_vision_model_entry) {
        [System.Windows.MessageBox]::Show(
            "Please select a vision model from the library list.",
            "No Model Selected",
            [System.Windows.MessageBoxButton]::OK,
            [System.Windows.MessageBoxImage]::Warning
        ) | Out-Null
        return
    }

    if (-not (Test-Path $llama_server_executable_path)) {
        [System.Windows.MessageBox]::Show(
            "llama-server.exe was not found at:`n$llama_server_executable_path`n`nPlease verify your installation.",
            "Server Executable Missing",
            [System.Windows.MessageBoxButton]::OK,
            [System.Windows.MessageBoxImage]::Error
        ) | Out-Null
        return
    }

    $target_port_number = [int]$server_port_text_box.Text.Trim()
    $selected_context_tokens_item = $context_tokens_combo_box.SelectedItem -as [System.Windows.Controls.ComboBoxItem]
    $configured_context_tokens = [int]$selected_context_tokens_item.Tag

    # Save user preference for fast future startup
    $selected_vision_model_entry.DisplayName | Out-File -FilePath $last_selected_model_choice_file_path -Encoding utf8

    # Free the port if occupied
    Terminate-PortConflicts -target_port_number $target_port_number

    # Assemble llama-server launch command line arguments
    $llama_server_arguments_array = [System.Collections.Generic.List[string]]::new()
    $llama_server_arguments_array.Add("-m")
    $llama_server_arguments_array.Add("`"$($selected_vision_model_entry.ModelAbsoluteFilePath)`"")
    $llama_server_arguments_array.Add("--mmproj")
    $llama_server_arguments_array.Add("`"$($selected_vision_model_entry.CompanionProjectorAbsoluteFilePath)`"")
    $llama_server_arguments_array.Add("--port")
    $llama_server_arguments_array.Add("$target_port_number")
    $llama_server_arguments_array.Add("-c")
    $llama_server_arguments_array.Add("$configured_context_tokens")

    if ($gpu_offload_check_box.IsChecked) {
        $llama_server_arguments_array.Add("-ngl")
        $llama_server_arguments_array.Add("99")
    }

    if ($flash_attention_check_box.IsChecked) {
        $llama_server_arguments_array.Add("--flash-attn")
        $llama_server_arguments_array.Add("on")
    }

    if ($quantized_kv_cache_check_box.IsChecked) {
        $llama_server_arguments_array.Add("-ctk")
        $llama_server_arguments_array.Add("q8_0")
        $llama_server_arguments_array.Add("-ctv")
        $llama_server_arguments_array.Add("q8_0")
    }

    $llama_server_arguments_array.Add("--host")
    $llama_server_arguments_array.Add("127.0.0.1")
    $llama_server_arguments_array.Add("--alias")
    $llama_server_arguments_array.Add("`"$($selected_vision_model_entry.DisplayName)`"")
    $llama_server_arguments_array.Add("--sleep-idle-seconds")
    $llama_server_arguments_array.Add("15")

    $full_command_string = "$llama_server_executable_path " + ($llama_server_arguments_array -join " ")

    $status_message_text_block.Text = "Spawning llama-server for $($selected_vision_model_entry.DisplayName)..."
    $activity_progress_bar.Visibility = [System.Windows.Visibility]::Visible
    $activity_progress_bar.IsIndeterminate = $true

    # Spawn llama-server in its own console window
    Start-Process -FilePath "cmd.exe" -ArgumentList @(
        '/k',
        "title llama-server ($($selected_vision_model_entry.DisplayName)) & $full_command_string"
    )

    # Launch the Electron Dev Server
    $env:LLAMA_SERVER_PORT = "$target_port_number"
    $env:LOCAL_AI_URL = "http://localhost:$target_port_number"

    Set-Location $launcher_script_directory
    Start-Process -FilePath "cmd.exe" -ArgumentList @(
        '/k',
        'title Video to Prompts Dev Server & npm run dev'
    )

    $status_message_text_block.Text = "[OK] Everything Launched! Server: http://localhost:$target_port_number | Model: $($selected_vision_model_entry.DisplayName)"
    $activity_progress_bar.Visibility = [System.Windows.Visibility]::Collapsed
})

# Initial load of vision models
Reload-VisionLibrary

# Show the GUI dialog window
$application_main_window.ShowDialog() | Out-Null
