class Remotelink < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.6.2"
  conflicts_with "remotelink-go", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.2/remotelink-v0.6.2-darwin-arm64", using: :nounzip
      sha256 "b3e10606aa5cb07e26e23b39179dafeba923a2b37d290e75411cd7e0625754a4"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.2/remotelink-v0.6.2-darwin-amd64", using: :nounzip
      sha256 "66b4f216af3ede031a5c0e0c5d9f94319ad29b28cac09f91ec52c2dae5a61540"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.2/remotelink-v0.6.2-linux-arm64", using: :nounzip
      sha256 "1365e9621824a8300e662930efdf9abea8fb15c942398e11eb14c9a76bb40f6b"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.2/remotelink-v0.6.2-linux-amd64", using: :nounzip
      sha256 "7c4ef29ffe4f4c94d9552ceccfa84ce4c73976560809d74927b902963cd32a61"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.6.2", shell_output("#{bin}/remotelink --version").strip
  end
end
